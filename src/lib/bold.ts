import "server-only"
import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { env } from "@/lib/env"
import type { BoldCheckoutConfig, PaymentEvent } from "@/types/payment"

// Exact cents <-> COP serialization, never floating point rounding of money.
export function centsToBoldAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("Invalid payment amount")
  const whole = Math.floor(cents / 100)
  const remainder = cents % 100
  return remainder === 0 ? String(whole) : `${whole}.${String(remainder).padStart(2, "0")}`
}
export function boldAmountToCents(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null
  const raw = String(value)
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null
  const [whole, fraction = ""] = raw.split(".")
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null
}
export function isPaymentReference(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,60}$/.test(value)
}
export function isBoldCheckoutExpired(createdAt: string, now = Date.now()): boolean {
  const created = Date.parse(createdAt)
  return !Number.isFinite(created) || now - created >= 23 * 60 * 60 * 1000
}
export function buildBoldCheckoutConfig(reference: string, total: number): BoldCheckoutConfig {
  if (!env.BOLD_CHECKOUT_ENABLED() || !isPaymentReference(reference)) throw new Error("Checkout unavailable")
  if (env.IS_PRODUCTION_DEPLOYMENT() && env.BOLD_ENVIRONMENT() !== "production") throw new Error("Invalid production payment environment")
  const amount = centsToBoldAmount(total)
  const appUrl = new URL(env.APP_URL())
  if (appUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(appUrl.hostname)) throw new Error("HTTPS required")
  return {
    orderId: reference, amount, currency: "COP", apiKey: env.BOLD_IDENTITY_KEY(),
    integritySignature: createHash("sha256").update(reference + amount + "COP" + env.BOLD_SECRET_KEY()).digest("hex"),
    description: "Cursos Studio Z Academy",
    redirectionUrl: new URL(`/pago/retorno?reference=${encodeURIComponent(reference)}`, appUrl).toString(),
    originUrl: new URL(`/pago/checkout?reference=${encodeURIComponent(reference)}`, appUrl).toString(),
  }
}
export function verifyBoldSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[a-fA-F0-9]{64}$/.test(signature)) return false
  const expected = createHmac("sha256", secret).update(Buffer.from(rawBody, "utf8").toString("base64")).digest()
  return timingSafeEqual(expected, Buffer.from(signature, "hex"))
}
export function boldWebhookSecret(): string {
  if (env.BOLD_ALLOW_EMPTY_SANDBOX_WEBHOOK_KEY()) {
    if (env.BOLD_ENVIRONMENT() !== "sandbox" || env.IS_PRODUCTION_DEPLOYMENT()) throw new Error("Sandbox-only webhook setting")
    return ""
  }
  return env.BOLD_SECRET_KEY()
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}
export function parseBoldNotification(value: unknown): PaymentEvent | null {
  const body = record(value)
  const data = record(body?.data)
  const amount = record(data?.amount)
  const metadata = record(data?.metadata)
  const cents = boldAmountToCents(amount?.total)
  if (!body || !data || !isPaymentReference(metadata?.reference) || typeof body.id !== "string" ||
    body.id.length < 1 || body.id.length > 200 || typeof body.type !== "string" || body.type.length > 80 ||
    typeof data.payment_id !== "string" || data.payment_id.length < 1 || data.payment_id.length > 100 ||
    (body.subject !== undefined && body.subject !== data.payment_id) || cents === null || amount?.currency !== "COP") return null
  return {
    provider: "bold", environment: env.BOLD_ENVIRONMENT(), eventId: body.id, reference: metadata.reference,
    transactionId: data.payment_id, status: body.type, amountInCents: cents, currency: "COP",
    paymentMethod: typeof data.payment_method === "string" ? data.payment_method.slice(0, 80) : null, source: "webhook",
  }
}
export async function queryBoldByReference(reference: string): Promise<PaymentEvent | null> {
  if (!env.BOLD_SETTLEMENT_ENABLED() || !isPaymentReference(reference)) return null
  const response = await fetch(`https://payments.api.bold.co/v2/payment-voucher/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `x-api-key ${env.BOLD_IDENTITY_KEY()}` }, cache: "no-store", signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error("Payment provider unavailable")
  const body = record(await response.json())
  if (!body || body.payment_status === "NO_TRANSACTION_FOUND") return null
  const amountInCents = boldAmountToCents(body.total)
  if (body.reference_id !== reference || typeof body.transaction_id !== "string" ||
    !body.transaction_id || typeof body.payment_status !== "string" || amountInCents === null ||
    (body.currency !== undefined && body.currency !== "COP")) return null
  // Voucher API omits currency; this integration creates COP-only buttons.
  return {
    provider: "bold", environment: env.BOLD_ENVIRONMENT(),
    eventId: `voucher:${body.transaction_id}:${body.payment_status}:${amountInCents}`,
    reference, transactionId: body.transaction_id, status: body.payment_status,
    amountInCents, currency: "COP",
    paymentMethod: typeof body.payment_method === "string" ? body.payment_method : null, source: "polling",
  }
}
