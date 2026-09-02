import "server-only"
import { createHash } from "node:crypto"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { paymentRpc } from "@/lib/payment-rpc"
import { generateReference } from "@/lib/utils"
import { env } from "@/lib/env"
import type { Json } from "@/types/database"

export interface CheckoutItem {
  courseId: string
  courseTitle: string
  listPrice: number
  courseDiscountAmount: number
  priceAfterCourseDiscount: number
  comboDiscountAmount: number
  finalPrice: number
}
export interface CheckoutOrder { id: string; reference: string; total: number; status: "pending" | "approved" }

export async function getPayableCheckoutOrder(reference: string, userId: string): Promise<{
  order: { id: string; reference: string; total: number; status: string; created_at: string } | null
  eligible: boolean; reason: string | null
}> {
  return paymentRpc(createServiceRoleClient(), "get_payable_checkout_order", {
    p_reference: reference, p_user_id: userId, p_environment: env.BOLD_ENVIRONMENT(),
  })
}

export async function createCheckoutOrder(input: {
  userId: string; customerName: string; customerEmail: string; customerPhone?: string | null
  items: CheckoutItem[]; discountRuleId?: string | null; discountRuleName?: string | null
  pricingSnapshot: Json; discountLines: Json[]
}): Promise<CheckoutOrder> {
  const items = [...input.items].sort((a, b) => a.courseId.localeCompare(b.courseId))
  if (!items.length || items.length > 100 || new Set(items.map((i) => i.courseId)).size !== items.length) throw new Error("Invalid checkout items")
  for (const item of items) {
    const amounts = [item.listPrice, item.courseDiscountAmount, item.priceAfterCourseDiscount, item.comboDiscountAmount, item.finalPrice]
    if (amounts.some((v) => !Number.isSafeInteger(v) || v < 0) ||
      item.listPrice - item.courseDiscountAmount !== item.priceAfterCourseDiscount ||
      item.priceAfterCourseDiscount - item.comboDiscountAmount !== item.finalPrice) throw new Error("Invalid checkout pricing")
  }
  const sum = (key: "listPrice" | "courseDiscountAmount" | "comboDiscountAmount" | "finalPrice") => items.reduce((total, item) => total + item[key], 0)
  const total = sum("finalPrice")
  if (total > 0 && !env.BOLD_CHECKOUT_ENABLED()) throw new Error("Checkout unavailable")
  const courseDiscount = sum("courseDiscountAmount")
  const comboDiscount = sum("comboDiscountAmount")
  const cartHash = createHash("sha256").update(JSON.stringify({ items, lines: input.discountLines })).digest("hex")
  return paymentRpc<CheckoutOrder>(createServiceRoleClient(), "create_checkout_order", {
    p_user_id: input.userId, p_cart_hash: cartHash,
    p_order: {
      reference: generateReference("SZ"), customer_name_snapshot: input.customerName,
      customer_email_snapshot: input.customerEmail, customer_phone_snapshot: input.customerPhone ?? null,
      list_subtotal: sum("listPrice"), subtotal: sum("listPrice") - courseDiscount,
      course_discount_amount: courseDiscount, combo_discount_amount: comboDiscount,
      discount_amount: courseDiscount + comboDiscount, total,
      discount_rule_id: input.discountRuleId ?? null, discount_rule_name_snapshot: input.discountRuleName ?? null,
      pricing_snapshot_json: input.pricingSnapshot, payment_environment: env.BOLD_ENVIRONMENT(),
    }, p_items: items as unknown as Json, p_lines: input.discountLines,
  })
}
