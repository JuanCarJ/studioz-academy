"use server"

import { createHash } from "crypto"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { enqueuePurchaseConfirmation } from "@/actions/email"
import { applyApprovedOrderEffects } from "@/lib/order-approval"
import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { createServerClient } from "@/lib/supabase/server"
import { resolveCartStateForUser } from "@/lib/cart"
import { isMissingDiscountRuleNameSnapshotColumn } from "@/lib/discount-rule-snapshot"
import { env } from "@/lib/env"
import { generateReference } from "@/lib/utils"
import { withVercelProtectionBypass } from "@/lib/vercel-protection"
import { createCheckoutUrl } from "@/lib/wompi"
import type { Json } from "@/types/database"

/**
 * Compute a deterministic hash of cart contents for idempotency.
 * Includes the effective pricing breakdown so pending orders are not reused
 * after a promotion changes.
 */
function computeCartHash(
  items: {
    courseId: string
    listPrice: number
    courseDiscountAmount: number
    comboDiscountAmount: number
    finalPrice: number
  }[]
): string {
  const sorted = [...items].sort((a, b) =>
    a.courseId.localeCompare(b.courseId)
  )
  const payload = sorted
    .map(
      (item) =>
        `${item.courseId}:${item.listPrice}:${item.courseDiscountAmount}:${item.comboDiscountAmount}:${item.finalPrice}`
    )
    .join(",")
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
  const listSubtotal = cartState.listSubtotal
  const subtotal = cartState.subtotal
  const courseDiscountAmount = cartState.courseDiscountAmount
  const comboDiscountAmount = cartState.comboDiscountAmount
  const discountAmount = cartState.discountAmount
  const discountRuleIds = cartState.primaryComboRuleIds
  const discountRuleId = discountRuleIds.length === 1 ? discountRuleIds[0] : null
  const discountRuleNameSnapshot =
    cartState.primaryComboRuleName ??
    (courseDiscountAmount > 0 && comboDiscountAmount > 0
      ? "Promociones multiples"
      : courseDiscountAmount > 0
        ? "Promociones por curso"
        : null)
  const total = cartState.total

  const cartHash = computeCartHash(
    items.map((item) => ({
      courseId: item.course.id,
      listPrice: item.listPrice,
      courseDiscountAmount: item.courseDiscountAmount,
      comboDiscountAmount: item.comboDiscountAmount,
      finalPrice: item.finalPrice,
    }))
  )

  const reference = generateReference("SZ")
  const isZeroTotalOrder = total === 0
  const now = new Date().toISOString()
  const pricingSnapshot = {
    listSubtotal: cartState.listSubtotal,
    subtotal: cartState.subtotal,
    courseDiscountTotal: cartState.courseDiscountAmount,
    comboDiscountTotal: cartState.comboDiscountAmount,
    discountTotal: cartState.discountAmount,
    total: cartState.total,
    appliedDiscountLines: cartState.appliedDiscountLines,
    items: cartState.items.map((item) => ({
      courseId: item.course.id,
      courseTitle: item.course.title,
      listPrice: item.listPrice,
      courseDiscountAmount: item.courseDiscountAmount,
      priceAfterCourseDiscount: item.priceAfterCourseDiscount,
      comboDiscountAmount: item.comboDiscountAmount,
      finalPrice: item.finalPrice,
      coursePromotionLabel: item.coursePromotionLabel,
      comboPromotionLabel: item.comboPromotionLabel,
    })),
  } as unknown as Json

  // Idempotency: check for recent pending order with same cart content
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id, reference, total, cart_hash, status")
    .eq("user_id", user.id)
    .in("status", isZeroTotalOrder ? ["pending", "approved"] : ["pending"])
    .gte("created_at", fiveMinutesAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let orderReference = reference
  let orderTotal = total
  let orderId: string | null = null

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
      orderId = existingOrder.id
      orderReference = existingOrder.reference
      orderTotal = existingOrder.total
    } else {
      // Order exists but items are missing — recreate items
      const orderItems = items.map((item) => ({
        order_id: existingOrder.id,
        course_id: item.course.id,
        course_title_snapshot: item.course.title,
        price_at_purchase: item.listPrice,
        list_price_snapshot: item.listPrice,
        course_discount_amount_snapshot: item.courseDiscountAmount,
        price_after_course_discount_snapshot: item.priceAfterCourseDiscount,
        combo_discount_amount_snapshot: item.comboDiscountAmount,
        final_price_snapshot: item.finalPrice,
      }))

      await supabase
        .from("order_discount_lines")
        .delete()
        .eq("order_id", existingOrder.id)

      const { error: recreateItemsError } = await supabase
        .from("order_items")
        .insert(orderItems)

      if (recreateItemsError) {
        redirect("/carrito?error=order_failed")
      }

      const recreatedLines = cartState.appliedDiscountLines.map((line) => ({
        order_id: existingOrder.id,
        scope: line.scope,
        kind: line.kind,
        source_id: line.source_id,
        source_name_snapshot: line.source_name,
        course_id: line.course_id,
        course_title_snapshot: line.course_title,
        amount: line.amount,
        metadata_json: (line.metadata ?? {}) as Json,
      }))

      if (recreatedLines.length > 0) {
        const { error: recreateLinesError } = await supabase
          .from("order_discount_lines")
          .insert(recreatedLines)

        if (recreateLinesError) {
          redirect("/carrito?error=order_failed")
        }
      }

      orderId = existingOrder.id
      orderReference = existingOrder.reference
      orderTotal = existingOrder.total
    }
  } else {
    // If there's a pending order with different cart content, void it
    if (
      existingOrder &&
      existingOrder.cart_hash !== cartHash &&
      existingOrder.status === "pending"
    ) {
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
      list_subtotal: listSubtotal,
      subtotal,
      course_discount_amount: courseDiscountAmount,
      combo_discount_amount: comboDiscountAmount,
      discount_amount: discountAmount,
      discount_rule_id: discountRuleId,
      discount_rule_name_snapshot: discountRuleNameSnapshot,
      pricing_snapshot_json: pricingSnapshot,
      total,
      currency: "COP",
      status: isZeroTotalOrder ? "approved" : "pending",
      payment_method: isZeroTotalOrder ? "promo" : null,
      approved_at: isZeroTotalOrder ? now : null,
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
      void _snapshot

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

    orderId = order.id

    // Create order items with price snapshot
    const orderItems = items.map((item) => ({
      order_id: order.id,
      course_id: item.course.id,
      course_title_snapshot: item.course.title,
      price_at_purchase: item.listPrice,
      list_price_snapshot: item.listPrice,
      course_discount_amount_snapshot: item.courseDiscountAmount,
      price_after_course_discount_snapshot: item.priceAfterCourseDiscount,
      combo_discount_amount_snapshot: item.comboDiscountAmount,
      final_price_snapshot: item.finalPrice,
    }))

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems)

    if (itemsError) {
      redirect("/carrito?error=order_failed")
    }

    const discountLines = cartState.appliedDiscountLines.map((line) => ({
      order_id: order.id,
      scope: line.scope,
      kind: line.kind,
      source_id: line.source_id,
      source_name_snapshot: line.source_name,
      course_id: line.course_id,
      course_title_snapshot: line.course_title,
      amount: line.amount,
      metadata_json: (line.metadata ?? {}) as Json,
    }))

    if (discountLines.length > 0) {
      const { error: discountLinesError } = await supabase
        .from("order_discount_lines")
        .insert(discountLines)

      if (discountLinesError) {
        redirect("/carrito?error=order_failed")
      }
    }

    orderReference = reference
    orderTotal = total
  }

  if (isZeroTotalOrder && orderId) {
    const { error: approvalError } = await supabase
      .from("orders")
      .update({
        status: "approved",
        payment_method: "promo",
        approved_at: now,
        updated_at: now,
      })
      .eq("id", orderId)

    if (approvalError) {
      redirect("/carrito?error=order_failed")
    }

    await applyApprovedOrderEffects({
      supabase,
      orderId,
      userId: user.id,
    })

    try {
      await enqueuePurchaseConfirmation(orderId)
    } catch (error) {
      console.error("[checkout.createOrder] zero-total email enqueue failed", error)
    }

    redirect("/dashboard/compras")
  }

  console.info(
    JSON.stringify({
      scope: "checkout.createOrder",
      userId: user.id,
      requestIp:
        (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      reference: orderReference,
      listSubtotal,
      subtotal,
      courseDiscountAmount,
      comboDiscountAmount,
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
