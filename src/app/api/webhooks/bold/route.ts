import { boldWebhookSecret, parseBoldNotification, verifyBoldSignature } from "@/lib/bold"
import { env } from "@/lib/env"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { paymentRpc } from "@/lib/payment-rpc"
import { readPaymentWebhookBody } from "@/lib/payment-webhook-body"
import type { Json } from "@/types/database"

export async function POST(request: Request) {
  if (!env.BOLD_SETTLEMENT_ENABLED()) return Response.json({ error: "Settlement disabled" }, { status: 503 })
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "JSON required" }, { status: 415 })
  const raw = await readPaymentWebhookBody(request)
  if (raw === null) return Response.json({ error: "Payload too large" }, { status: 413 })
  try {
    if (!verifyBoldSignature(raw, request.headers.get("x-bold-signature"), boldWebhookSecret())) {
      return Response.json({ error: "Invalid signature" }, { status: 401 })
    }
  } catch { return Response.json({ error: "Webhook unavailable" }, { status: 503 }) }
  let event
  try { event = parseBoldNotification(JSON.parse(raw)) }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
  if (!event) return Response.json({ error: "Invalid notification" }, { status: 400 })
  try {
    // Persist minimum durable event first. Cron performs business effects.
    await paymentRpc(createServiceRoleClient(), "receive_payment_notification", { p_event: event as unknown as Json })
    return Response.json({ received: true })
  } catch {
    return Response.json({ error: "Receipt failed" }, { status: 503 })
  }
}
