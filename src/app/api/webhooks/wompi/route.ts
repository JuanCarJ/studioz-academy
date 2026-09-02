import { createHash } from "node:crypto"
import { env } from "@/lib/env"
import { verifyWebhookSignature, queryWompiTransactionById, type WompiWebhookEvent } from "@/lib/wompi"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { paymentRpc } from "@/lib/payment-rpc"
import { readPaymentWebhookBody } from "@/lib/payment-webhook-body"
import type { Json } from "@/types/database"

export async function POST(request: Request) {
  // Drain historical Wompi orders only when explicitly enabled. Never create one.
  if (!env.WOMPI_LEGACY_SETTLEMENT_ENABLED()) return Response.json({ error: "Legacy settlement disabled" }, { status: 503 })
  const raw = await readPaymentWebhookBody(request)
  if (raw === null) return Response.json({ error: "Payload too large" }, { status: 413 })
  let body: WompiWebhookEvent
  try { body = JSON.parse(raw) } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
  let verified = false
  try { verified = verifyWebhookSignature(body, env.WOMPI_EVENTS_SECRET()) } catch { /* malformed */ }
  if (!verified) return Response.json({ error: "Invalid signature" }, { status: 401 })
  const tx = body.data?.transaction
  if (!tx || typeof tx.reference !== "string" || typeof tx.id !== "string" ||
    !Number.isSafeInteger(tx.amount_in_cents) || tx.amount_in_cents < 0 || tx.currency !== "COP") {
    return Response.json({ error: "Invalid transaction" }, { status: 400 })
  }
  // Wompi's signed properties need not include reference/currency. Resolve the
  // signed transaction ID authoritatively before trusting either field.
  const canonical = await queryWompiTransactionById(tx.id)
  if (!canonical) return Response.json({ error: "Cannot verify legacy transaction" }, { status: 503 })
  if (canonical.transactionId !== tx.id || canonical.reference !== tx.reference ||
      canonical.amountInCents !== tx.amount_in_cents || canonical.currency !== tx.currency) {
    return Response.json({ error: "Transaction identity mismatch" }, { status: 400 })
  }
  try {
    await paymentRpc(createServiceRoleClient(), "receive_payment_notification", { p_event: {
      provider: "wompi", environment: "legacy", eventId: createHash("sha256").update(raw).digest("hex"),
      reference: canonical.reference, transactionId: canonical.transactionId, status: canonical.status, amountInCents: canonical.amountInCents,
      currency: canonical.currency, paymentMethod: canonical.paymentMethodType, source: "webhook",
    } as Json })
    return Response.json({ received: true })
  } catch { return Response.json({ error: "Receipt failed" }, { status: 503 }) }
}
