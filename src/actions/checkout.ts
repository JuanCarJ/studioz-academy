"use server"

import { createHash } from "crypto"

import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { createServerClient } from "@/lib/supabase/server"
import { env } from "@/lib/env"
import { getBestDiscount } from "@/lib/discounts"
import { generateReference } from "@/lib/utils"
import { createCheckoutUrl } from "@/lib/wompi"
import { getCart } from "@/actions/cart"
import type { DiscountRule } from "@/types"

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

export async function createOrder(): Promise<never> {
  const user = await getCurrentUser()
  if (!user) redirect("/login?redirect=/carrito")

  const items = await getCart()

  if (items.length === 0) {
    redirect("/carrito")
  }

  // Filter only paid courses (free courses should use enrollFree)
  const paidItems = items.filter((item) => !item.course.is_free)
  if (paidItems.length === 0) {
    redirect("/carrito")
  }

  const subtotal = paidItems.reduce((acc, item) => acc + item.course.price, 0)

  const supabase = createServiceRoleClient()
  const rlsClient = await createServerClient()
  const { data: discountRules } = await rlsClient
    .from("discount_rules")
    .select("*")
    .eq("is_active", true)

  const discount = getBestDiscount(
    paidItems.map((item) => ({
      category: item.course.category,
      price: item.course.price,
      isFree: item.course.is_free,
    })),
    (discountRules ?? []) as DiscountRule[]
  )

  const discountAmount = discount.amount
  const discountRuleId = discount.rule?.id ?? null

  const total = subtotal - discountAmount

  const cartHash = computeCartHash(
    paidItems.map((item) => ({
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
      const orderItems = paidItems.map((item) => ({
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
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        reference,
        customer_name_snapshot: user.full_name,
        customer_email_snapshot: user.email,
        customer_phone_snapshot: user.phone ?? null,
        subtotal,
        discount_amount: discountAmount,
        discount_rule_id: discountRuleId,
        total,
        currency: "COP",
        status: "pending",
        cart_hash: cartHash,
      })
      .select("id")
      .single()

    if (orderError || !order) {
      redirect("/carrito?error=order_failed")
    }

    // Create order items with price snapshot
    const orderItems = paidItems.map((item) => ({
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
      reference: orderReference,
      subtotal,
      discountAmount,
      discountRuleId,
      total: orderTotal,
      itemCount: paidItems.length,
    })
  )

  // Build Wompi checkout URL and redirect
  const redirectUrl = `${env.APP_URL()}/pago/retorno?reference=${orderReference}`
  const checkoutUrl = createCheckoutUrl({
    reference: orderReference,
    amountInCents: orderTotal,
    redirectUrl,
  })

  redirect(checkoutUrl)
}
