"use server"

import { createServiceRoleClient } from "@/lib/supabase/admin"
import { queryWompiByReference } from "@/lib/wompi"
import { mapWompiStatus, isValidTransition } from "@/lib/payments"

import type { Order } from "@/types"

export interface OrderItem {
  courseTitle: string
  courseSlug: string
}

export async function getOrderStatusWithFallback(
  reference: string
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

  // If still pending and created > 2 min ago, check Wompi as fallback
  if (order.status === "pending") {
    const createdAt = new Date(order.created_at).getTime()
    const twoMinutesAgo = Date.now() - 2 * 60 * 1000

    if (createdAt < twoMinutesAgo) {
      // H-03: try/catch around Wompi fetch — fallback to returning order as-is
      try {
        const wompiResult = await queryWompiByReference(reference)
        if (wompiResult) {
          const mappedStatus = mapWompiStatus(wompiResult.status)
          if (mappedStatus && mappedStatus !== "pending") {
            await applyReconciliation(
              order.id,
              order.status as Parameters<typeof isValidTransition>[0],
              mappedStatus,
              wompiResult.transactionId,
              order.user_id
            )

            const enriched = await enrichOrderResponse(
              { ...order, status: mappedStatus } as Order,
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

  const enriched = await enrichOrderResponse(order as Order, supabase)
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
  transactionId: string,
  userId: string | null
) {
  if (!isValidTransition(currentStatus, newStatus)) return

  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()

  // Update order
  const updateData: Record<string, unknown> = {
    status: newStatus,
    wompi_transaction_id: transactionId,
    updated_at: now,
  }
  if (newStatus === "approved") {
    updateData.approved_at = now
  }

  await supabase.from("orders").update(updateData).eq("id", orderId)

  // If approved: create enrollments + clear cart
  if (newStatus === "approved" && userId) {
    const { data: orderItems } = await supabase
      .from("order_items")
      .select("course_id")
      .eq("order_id", orderId)

    const enrollments =
      orderItems
        ?.filter((item) => item.course_id !== null)
        .map((item) => ({
          user_id: userId,
          course_id: item.course_id!,
          source: "purchase",
          order_id: orderId,
        })) ?? []

    if (enrollments.length > 0) {
      await supabase.from("enrollments").upsert(enrollments, {
        onConflict: "user_id,course_id",
        ignoreDuplicates: true,
      })
    }

    await supabase.from("cart_items").delete().eq("user_id", userId)
  }

  // H-02: Use "polling" source for reconciliation fallback checks.
  await supabase.from("payment_events").insert({
    order_id: orderId,
    source: "polling",
    external_status: newStatus.toUpperCase(),
    mapped_status: newStatus,
    wompi_transaction_id: transactionId,
    is_applied: true,
    payload_hash: `polling-${orderId}-${now}`,
    payload_json: { source: "fallback_check", transactionId },
  })
}

export async function reconcilePendingOrders(): Promise<{
  reconciled: number
}> {
  const supabase = createServiceRoleClient()

  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

  const { data: pendingOrders } = await supabase
    .from("orders")
    .select("id, reference, status, user_id")
    .eq("status", "pending")
    .lt("created_at", fifteenMinutesAgo)
    .limit(50)

  if (!pendingOrders?.length) return { reconciled: 0 }

  let reconciled = 0

  for (const order of pendingOrders) {
    // H-03: try/catch per order — continue to next instead of aborting batch
    try {
      const wompiResult = await queryWompiByReference(order.reference)
      if (!wompiResult) continue

      const mappedStatus = mapWompiStatus(wompiResult.status)
      if (!mappedStatus || mappedStatus === "pending") continue

      await applyReconciliation(
        order.id,
        order.status as Parameters<typeof isValidTransition>[0],
        mappedStatus,
        wompiResult.transactionId,
        order.user_id
      )

      reconciled++
    } catch {
      continue
    }
  }

  return { reconciled }
}
