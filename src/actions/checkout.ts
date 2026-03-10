"use server"

import { createHash } from "crypto"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { createServerClient } from "@/lib/supabase/server"
import { resolveCartStateForUser } from "@/lib/cart"
import { isMissingDiscountRuleNameSnapshotColumn } from "@/lib/discount-rule-snapshot"
import { env } from "@/lib/env"
import { generateReference } from "@/lib/utils"
import { withVercelProtectionBypass } from "@/lib/vercel-protection"
import { createCheckoutUrl } from "@/lib/wompi"

/**
 * Compute a deterministic hash of cart contents for idempotency.
 * Sorts by course_id to ensure same items always produce same hash.
 */
function computeCartHash(
  items: { courseId: string; price: number }[]
): string {
  const sorted = [...items].sort((a, b) =>
    a.courseId.localeCompare(b.courseId)
  )
  const payload = sorted.map((i) => `${i.courseId}:${i.price}`).join(",")
  return createHash("sha256").update(payload).digest("hex")
}

function parseCustomerPhone(
  phone: string | null | undefined
): { phoneNumber: string | null; phonePrefix: string | null } {
  if (!phone) {
    return { phoneNumber: null, phonePrefix: null }
  }

  const normalized = phone.replace(/\s+/g, "")
  const withPlus = normalized.startsWith("+") ? normalized : `+${normalized}`
  const match = withPlus.match(/^(\+\d{1,4})(\d{6,14})$/)

  if (!match) {
    return { phoneNumber: null, phonePrefix: null }
  }

  return {
    phonePrefix: match[1],
    phoneNumber: match[2],
  }
}

export async function createOrder(): Promise<never> {
  const user = await getCurrentUser()
  if (!user) redirect("/login?redirect=/carrito")

  const rlsClient = await createServerClient()
  const cartState = await resolveCartStateForUser({
    supabase: rlsClient,
    userId: user.id,
  })
  const items = cartState.items

  if (items.length === 0) {
    redirect("/carrito")
  }

  const supabase = createServiceRoleClient()
  const subtotal = cartState.subtotal
  const discountAmount = cartState.discountAmount
  const discountRuleId = cartState.discountRule?.id ?? null
  const discountRuleNameSnapshot = cartState.discountRule?.name ?? null
  const total = cartState.total

  const cartHash = computeCartHash(
    items.map((item) => ({
      courseId: item.course.id,
      price: item.course.price,
    }))
  )

  const reference = generateReference("SZ")

  // Idempotency: check for recent pending order with same cart content
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id, reference, total, cart_hash")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .gte("created_at", fiveMinutesAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let orderReference = reference
  let orderTotal = total

  if (
    existingOrder &&
    existingOrder.cart_hash === cartHash &&
    existingOrder.total === total
  ) {
    // Verify order_items exist for the reused order
    const { count, error: orderItemsCountError } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", existingOrder.id)

    if (orderItemsCountError) {
      redirect("/carrito?error=order_failed")
    }

    if (count && count > 0) {
      // Reuse existing pending order — same cart content
      orderReference = existingOrder.reference
      orderTotal = existingOrder.total
    } else {
      // Order exists but items are missing — recreate items
      const orderItems = items.map((item) => ({
        order_id: existingOrder.id,
        course_id: item.course.id,
        course_title_snapshot: item.course.title,
        price_at_purchase: item.course.price,
      }))

      const { error: recreateItemsError } = await supabase
        .from("order_items")
        .insert(orderItems)

      if (recreateItemsError) {
        redirect("/carrito?error=order_failed")
      }

      orderReference = existingOrder.reference
      orderTotal = existingOrder.total
    }
  } else {
    // If there's a pending order with different cart content, void it
    if (existingOrder && existingOrder.cart_hash !== cartHash) {
      await supabase
        .from("orders")
        .update({ status: "voided", updated_at: new Date().toISOString() })
        .eq("id", existingOrder.id)
    }

    // Create new order with snapshot data
    const orderPayload = {
      user_id: user.id,
      reference,
      customer_name_snapshot: user.full_name,
      customer_email_snapshot: user.email,
      customer_phone_snapshot: user.phone ?? null,
      subtotal,
      discount_amount: discountAmount,
      discount_rule_id: discountRuleId,
      discount_rule_name_snapshot: discountRuleNameSnapshot,
      total,
      currency: "COP",
      status: "pending" as const,
      cart_hash: cartHash,
    }

    let { data: order, error: orderError } = await supabase
      .from("orders")
      .insert(orderPayload)
      .select("id")
      .single()

    if (isMissingDiscountRuleNameSnapshotColumn(orderError)) {
      const { discount_rule_name_snapshot: _snapshot, ...legacyOrderPayload } =
        orderPayload

      const legacyInsert = await supabase
        .from("orders")
        .insert(legacyOrderPayload)
        .select("id")
        .single()

      order = legacyInsert.data
      orderError = legacyInsert.error
    }

    if (orderError || !order) {
      redirect("/carrito?error=order_failed")
    }

    // Create order items with price snapshot
    const orderItems = items.map((item) => ({
      order_id: order.id,
      course_id: item.course.id,
      course_title_snapshot: item.course.title,
      price_at_purchase: item.course.price,
    }))

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems)

    if (itemsError) {
      redirect("/carrito?error=order_failed")
    }

    orderReference = reference
    orderTotal = total
  }

  console.info(
    JSON.stringify({
      scope: "checkout.createOrder",
      userId: user.id,
      requestIp:
        (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      reference: orderReference,
      subtotal,
      discountAmount,
      discountRuleId,
      discountRuleNameSnapshot,
      total: orderTotal,
      itemCount: items.length,
    })
  )

  // Build Wompi checkout URL and redirect
  const { phoneNumber, phonePrefix } = parseCustomerPhone(user.phone)
  const redirectUrl = withVercelProtectionBypass(
    `${env.APP_URL()}/pago/retorno?reference=${orderReference}`,
    { setCookie: true }
  )
  const checkoutUrl = createCheckoutUrl({
    reference: orderReference,
    amountInCents: orderTotal,
    redirectUrl,
    customerEmail: user.email,
    customerFullName: user.full_name,
    customerPhoneNumber: phoneNumber,
    customerPhoneNumberPrefix: phonePrefix,
  })

  redirect(checkoutUrl)
}
