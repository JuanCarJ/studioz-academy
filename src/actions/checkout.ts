"use server"

import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { resolveCartStateForUser } from "@/lib/cart"
import { createCheckoutOrder } from "@/lib/checkout-order"
import { enforceRateLimit } from "@/lib/security/rate-limit"
import type { Json } from "@/types/database"

export async function createOrder(): Promise<never> {
  const user = await getCurrentUser()
  if (!user) redirect("/login?redirect=/carrito")
  if (!(await enforceRateLimit({ scope: "checkout", key: user.id, limit: 10, windowSeconds: 60 })).allowed) redirect("/carrito?error=order_failed")
  const cart = await resolveCartStateForUser({ supabase: await createServerClient(), userId: user.id })
  if (!cart.items.length) redirect("/carrito")
  const items = cart.items.map((item) => ({
    courseId: item.course.id, courseTitle: item.course.title,
    listPrice: item.listPrice, courseDiscountAmount: item.courseDiscountAmount,
    priceAfterCourseDiscount: item.priceAfterCourseDiscount,
    comboDiscountAmount: item.comboDiscountAmount, finalPrice: item.finalPrice,
    coursePromotionLabel: item.coursePromotionLabel, comboPromotionLabel: item.comboPromotionLabel,
  }))
  let order
  try {
    order = await createCheckoutOrder({
      userId: user.id, customerName: user.full_name, customerEmail: user.email, customerPhone: user.phone,
      items,
      discountRuleId: cart.primaryComboRuleIds.length === 1 ? cart.primaryComboRuleIds[0] : null,
      discountRuleName: cart.primaryComboRuleName ?? (cart.courseDiscountAmount > 0 ? "Promociones por curso" : null),
      pricingSnapshot: {
        listSubtotal: cart.listSubtotal, subtotal: cart.subtotal,
        courseDiscountTotal: cart.courseDiscountAmount, comboDiscountTotal: cart.comboDiscountAmount,
        discountTotal: cart.discountAmount, total: cart.total, appliedDiscountLines: cart.appliedDiscountLines, items,
      } as unknown as Json,
      discountLines: cart.appliedDiscountLines as unknown as Json[],
    })
  } catch {
    redirect("/carrito?error=order_failed")
  }
  if (order.status === "approved") redirect("/dashboard/compras")
  redirect(`/pago/checkout?reference=${encodeURIComponent(order.reference)}`)
}
