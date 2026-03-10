"use server"

import { applyApprovedOrderEffects } from "@/lib/order-approval"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import {
  queryWompiByReference,
  queryWompiTransactionById,
  type WompiTransactionLookup,
} from "@/lib/wompi"
import { mapWompiStatus, isValidTransition } from "@/lib/payments"
import { enqueuePurchaseConfirmation } from "@/actions/email"

import type { Order } from "@/types"

const PAYMENT_RETURN_RECHECK_DELAY_MS = 30_000
const RECONCILE_PENDING_MIN_AGE_MS = 2 * 60 * 1000
const RECONCILE_PENDING_BATCH_SIZE = 100

export interface OrderItem {
  courseTitle: string
  courseSlug: string
}

async function resolveWompiTransaction(params: {
  reference: string
  transactionId?: string
}): Promise<WompiTransactionLookup | null> {
  if (params.transactionId) {
    const byId = await queryWompiTransactionById(params.transactionId)
    if (byId?.reference === params.reference) {
      return byId
    }
  }

  return queryWompiByReference(params.reference)
}

async function attachKnownWompiTransaction(
  order: Order,
  supabase: ReturnType<typeof createServiceRoleClient>,
  transactionId?: string
): Promise<{
  order: Order
  transaction: WompiTransactionLookup | null
}> {
  if (!transactionId) {
    return { order, transaction: null }
  }

  try {
    const transaction = await queryWompiTransactionById(transactionId)
    if (!transaction || transaction.reference !== order.reference) {
      return { order, transaction: null }
    }

    const amountMatches = transaction.amountInCents === order.total
    const currencyMatches =
      transaction.currency.toUpperCase() === order.currency.toUpperCase()

    if (!amountMatches || !currencyMatches) {
      return { order, transaction: null }
    }

    if (
      order.wompi_transaction_id !== transactionId ||
      (!order.payment_method && transaction.paymentMethodType)
    ) {
      await supabase
        .from("orders")
        .update({
          wompi_transaction_id: transactionId,
          payment_method: order.payment_method ?? transaction.paymentMethodType,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)

      return {
        order: {
          ...order,
          wompi_transaction_id: transactionId,
          payment_method: order.payment_method ?? transaction.paymentMethodType,
        },
        transaction,
      }
    }

    return { order, transaction }
  } catch {
    return { order, transaction: null }
  }
}

export async function getOrderStatusWithFallback(
  reference: string,
  transactionId?: string
): Promise<{
  order: Order | null
  liveStatus?: string
  orderItems?: OrderItem[]
  isFirstPurchase?: boolean
}> {
  const supabase = createServiceRoleClient()

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("reference", reference)
    .maybeSingle()

  if (error || !order) return { order: null }
  const {
    order: hydratedOrder,
    transaction: hintedTransaction,
  } = await attachKnownWompiTransaction(order as Order, supabase, transactionId)

  // If still pending and created > 30s ago, check Wompi as fallback.
  // This keeps the return page responsive for slow methods like PSE/Nequi
  // without depending exclusively on webhook arrival.
  if (hydratedOrder.status === "pending") {
    const createdAt = new Date(hydratedOrder.created_at).getTime()
    const recheckAfter = Date.now() - PAYMENT_RETURN_RECHECK_DELAY_MS

    if (createdAt < recheckAfter) {
      // H-03: try/catch around Wompi fetch — fallback to returning order as-is
      try {
        const wompiResult =
          hintedTransaction ??
          (await resolveWompiTransaction({ reference, transactionId }))
        if (wompiResult) {
          const mappedStatus = mapWompiStatus(wompiResult.status)
          const amountMatches = wompiResult.amountInCents === hydratedOrder.total
          const currencyMatches =
            wompiResult.currency.toUpperCase() === hydratedOrder.currency.toUpperCase()

          if (mappedStatus && mappedStatus !== "pending" && amountMatches && currencyMatches) {
            await applyReconciliation(
              hydratedOrder.id,
              hydratedOrder.status as Parameters<typeof isValidTransition>[0],
              mappedStatus,
              wompiResult.status,
              wompiResult.transactionId,
              wompiResult.paymentMethodType,
              wompiResult.customerEmail,
              hydratedOrder.user_id
            )

            const enriched = await enrichOrderResponse(
              {
                ...hydratedOrder,
                status: mappedStatus,
                wompi_transaction_id: wompiResult.transactionId,
                payment_method: wompiResult.paymentMethodType,
              } as Order,
              supabase
            )

            return {
              ...enriched,
              liveStatus: wompiResult.status,
            }
          }
        }
      } catch {
        // Wompi fetch failed — return order as-is without crashing
      }
    }
  }

  const enriched = await enrichOrderResponse(hydratedOrder, supabase)
  return enriched
}

/**
 * H-09: Enrich approved orders with item details and first-purchase flag.
 */
async function enrichOrderResponse(
  order: Order,
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<{
  order: Order
  orderItems?: OrderItem[]
  isFirstPurchase?: boolean
}> {
  if (order.status !== "approved") {
    return { order }
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("course_id, course_title_snapshot, courses(slug)")
    .eq("order_id", order.id)

  const orderItems: OrderItem[] = (items ?? []).map((item) => {
    const course = Array.isArray(item.courses) ? item.courses[0] : item.courses
    return {
      courseTitle: item.course_title_snapshot,
      courseSlug: (course as { slug: string } | null)?.slug ?? "",
    }
  })

  // Check if first purchase
  let isFirstPurchase = true
  if (order.user_id) {
    const { count } = await supabase
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", order.user_id)
      .eq("source", "purchase")
      .neq("order_id", order.id)

    isFirstPurchase = (count ?? 0) === 0
  }

  return { order, orderItems, isFirstPurchase }
}

async function applyReconciliation(
  orderId: string,
  currentStatus: Parameters<typeof isValidTransition>[0],
  newStatus: ReturnType<typeof mapWompiStatus> & string,
  externalStatus: string,
  transactionId: string,
  paymentMethodType: string | null,
  customerEmail: string | null,
  userId: string | null
) {
  if (!isValidTransition(currentStatus, newStatus)) return

  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()

  // Update order
  const updateData: Record<string, unknown> = {
    status: newStatus,
    wompi_transaction_id: transactionId,
    payment_method: paymentMethodType,
    updated_at: now,
  }
  if (newStatus === "approved") {
    updateData.approved_at = now
  }

  await supabase.from("orders").update(updateData).eq("id", orderId)
  console.info(
    JSON.stringify({
      scope: "payments.applyReconciliation",
      orderId,
      transactionId,
      currentStatus,
      newStatus,
      userId,
    })
  )

  // If approved: create enrollments + clear cart
  if (newStatus === "approved" && userId) {
    await applyApprovedOrderEffects({
      supabase,
      orderId,
      userId,
    })
  }

  // H-02: Use "polling" source for reconciliation fallback checks.
  await supabase.from("payment_events").insert({
    order_id: orderId,
    source: "polling",
    external_status: externalStatus,
    mapped_status: newStatus,
    wompi_transaction_id: transactionId,
    is_applied: true,
    payload_hash: `polling-${orderId}-${now}`,
    payload_json: {
      source: "fallback_check",
      transactionId,
      externalStatus,
      paymentMethodType,
      customerEmail,
    },
  })

  // Enqueue purchase confirmation email after successful reconciliation (non-blocking)
  if (newStatus === "approved") {
    try {
      await enqueuePurchaseConfirmation(orderId)
    } catch {
      // Non-blocking: email enqueue failure must not abort reconciliation
    }
  }
}

export async function reconcilePendingOrders(): Promise<{
  reconciled: number
}> {
  const supabase = createServiceRoleClient()

  const pendingMinAge = new Date(Date.now() - RECONCILE_PENDING_MIN_AGE_MS).toISOString()

  const { data: pendingOrders } = await supabase
    .from("orders")
    .select("id, reference, status, user_id, total, currency")
    .eq("status", "pending")
    .lt("created_at", pendingMinAge)
    .limit(RECONCILE_PENDING_BATCH_SIZE)

  if (!pendingOrders?.length) return { reconciled: 0 }

  let reconciled = 0

  for (const order of pendingOrders) {
    // H-03: try/catch per order — continue to next instead of aborting batch
    try {
      console.info(
        JSON.stringify({
          scope: "payments.reconcilePendingOrders",
          orderId: order.id,
          reference: order.reference,
          status: order.status,
        })
      )
      const wompiResult = await queryWompiByReference(order.reference)
      if (!wompiResult) continue

      const mappedStatus = mapWompiStatus(wompiResult.status)
      if (!mappedStatus || mappedStatus === "pending") continue

      if (
        wompiResult.amountInCents !== order.total ||
        wompiResult.currency.toUpperCase() !== order.currency.toUpperCase()
      ) {
        continue
      }

      await applyReconciliation(
        order.id,
        order.status as Parameters<typeof isValidTransition>[0],
        mappedStatus,
        wompiResult.status,
        wompiResult.transactionId,
        wompiResult.paymentMethodType,
        wompiResult.customerEmail,
        order.user_id
      )

      reconciled++
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: "payments.reconcilePendingOrders.error",
          orderId: order.id,
          reference: order.reference,
          error: error instanceof Error ? error.message : "unknown",
        })
      )
      continue
    }
  }

  return { reconciled }
}
