import "server-only"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { paymentRpc } from "@/lib/payment-rpc"
import { queryBoldByReference } from "@/lib/bold"
import { queryWompiByReference } from "@/lib/wompi"
import { env } from "@/lib/env"
import type { Json } from "@/types/database"
import type { OrderStatus } from "@/lib/payments"
import type { PaymentEvent } from "@/types/payment"

export interface ReconciliationOrder {
  id: string; reference: string; status: OrderStatus; total: number; currency: string; created_at: string
  payment_provider: "bold" | "wompi" | "internal"; payment_environment: "sandbox" | "production" | "legacy"
}
export async function applyPaymentEvent(event: PaymentEvent): Promise<{ applied: boolean; status: OrderStatus; duplicate: boolean }> {
  return paymentRpc(createServiceRoleClient(), "apply_payment_event", { p_event: event as unknown as Json })
}
export async function reconcileOrder(order: ReconciliationOrder): Promise<{ applied: boolean }> {
  const provider = order.payment_provider ?? "wompi"
  if (provider === "internal") return { applied: false }
  if (provider === "bold" && (!env.BOLD_SETTLEMENT_ENABLED() || order.payment_environment !== env.BOLD_ENVIRONMENT() ||
    Date.parse(order.created_at) < Date.now() - 24 * 60 * 60 * 1000)) return { applied: false }
  if (provider === "wompi" && !env.WOMPI_LEGACY_SETTLEMENT_ENABLED()) return { applied: false }
  if (!await paymentRpc<boolean>(createServiceRoleClient(), "claim_payment_recheck", { p_order_id: order.id })) return { applied: false }
  if (provider === "bold") {
    const event = await queryBoldByReference(order.reference)
    return event ? applyPaymentEvent(event) : { applied: false }
  }
  const tx = await queryWompiByReference(order.reference)
  if (!tx) return { applied: false }
  return applyPaymentEvent({
    provider: "wompi", environment: "legacy", eventId: `polling:${tx.transactionId}:${tx.status}:${tx.amountInCents}`,
    reference: tx.reference, transactionId: tx.transactionId, status: tx.status, amountInCents: tx.amountInCents,
    currency: tx.currency, paymentMethod: tx.paymentMethodType, source: "reconciliation",
  })
}
export async function reconcilePendingOrders(): Promise<{ reconciled: number; failed: number; notifications: number }> {
  const client = createServiceRoleClient()
  const boldEnvironment = env.BOLD_SETTLEMENT_ENABLED() ? env.BOLD_ENVIRONMENT() : null
  const legacyEnabled = env.WOMPI_LEGACY_SETTLEMENT_ENABLED()
  const inbox = await paymentRpc<{ processed: number; failed: number }>(client, "process_payment_notifications", {
    p_limit: 20, p_bold_environment: boldEnvironment, p_wompi_enabled: legacyEnabled,
  })
  if (!boldEnvironment && !legacyEnabled) return { reconciled: 0, failed: inbox.failed, notifications: inbox.processed }
  const deadline = Date.now() + 35_000
  const providerFilter = [boldEnvironment ? `and(payment_provider.eq.bold,payment_environment.eq.${boldEnvironment})` : null,
    legacyEnabled ? "payment_provider.eq.wompi" : null].filter(Boolean).join(",")
  const { data, error } = await client.from("orders").select("*").eq("status", "pending").or(providerFilter)
    .lt("created_at", new Date(Date.now() - 60_000).toISOString())
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order("payment_checked_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: true })
    .order("id", { ascending: true }).limit(10)
  if (error) throw new Error("Cannot read pending payments")
  let reconciled = 0
  let failed = inbox.failed
  for (const raw of data ?? []) {
    if (Date.now() > deadline) break
    try { if ((await reconcileOrder(raw as ReconciliationOrder)).applied) reconciled++ }
    catch { failed++ }
  }
  return { reconciled, failed, notifications: inbox.processed }
}
