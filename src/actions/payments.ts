"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { isPaymentReference } from "@/lib/bold"
import { enforceRateLimit } from "@/lib/security/rate-limit"
import { reconcileOrder, type ReconciliationOrder } from "@/lib/payment-reconciliation"
import type { PaymentReturnOrder, PaymentReturnItem } from "@/types/payment"

export type OrderItem = PaymentReturnItem

export async function getOrderStatusWithFallback(reference: string, _transactionId?: string): Promise<{
  order: PaymentReturnOrder | null; orderItems?: PaymentReturnItem[]; isFirstPurchase?: boolean
}> {
  void _transactionId // Browser hints are not authorization or confirmation.
  const user = await getCurrentUser()
  if (!user || !isPaymentReference(reference)) return { order: null }
  if (!(await enforceRateLimit({ scope: "payment-status", key: user.id, limit: 30, windowSeconds: 60 })).allowed) throw new Error("Espera un momento antes de consultar nuevamente")
  const client = createServiceRoleClient()
  const readOwnedOrder = () => client.from("orders").select("*").eq("reference", reference).eq("user_id", user.id).maybeSingle()
  const initial = await readOwnedOrder()
  if (initial.error || !initial.data) return { order: null }
  let order = initial.data as ReconciliationOrder
  if (order.status === "pending" && Date.parse(order.created_at) < Date.now() - 30_000) {
    try { await reconcileOrder(order) } catch { /* Keep persisted state; never invent approval. */ }
    const latest = await readOwnedOrder()
    if (latest.error) return { order: null }
    if (!latest.data) return { order: null }
    order = latest.data as ReconciliationOrder
  }
  const dto: PaymentReturnOrder = { reference: order.reference, status: order.status, total: order.total, currency: order.currency }
  if (order.status !== "approved") return { order: dto }
  const { data: items, error } = await client.from("order_items").select("course_title_snapshot, courses(slug)").eq("order_id", order.id)
  if (error) return { order: dto }
  const { count, error: countError } = await client.from("enrollments").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("source", "purchase").neq("order_id", order.id)
  return {
    order: dto,
    orderItems: (items ?? []).map((item) => {
      const course = Array.isArray(item.courses) ? item.courses[0] : item.courses
      return { courseTitle: item.course_title_snapshot, courseSlug: course?.slug ?? "" }
    }),
    isFirstPurchase: !countError && count === 0,
  }
}
