import { createHash } from "crypto"

import { env } from "@/lib/env"

/**
 * Wompi webhook event payload shape.
 * Properties may vary per event — never hard-code the properties array.
 */
export interface WompiWebhookEvent {
  event: string
  data: {
    transaction: {
      id: string
      amount_in_cents: number
      reference: string
      customer_email: string
      currency: string
      payment_method_type: string
      status: string
      [key: string]: unknown
    }
  }
  environment: string
  signature: {
    properties: string[]
    checksum: string
  }
  timestamp: number
  sent_at: string
}

/**
 * Resolve a dot-path like "transaction.id" from the event.data object.
 */
function getNestedValue(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split(".")
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Verify the SHA-256 signature of a Wompi webhook event.
 *
 * Wompi signature verification:
 * 1. Resolve each property in signature.properties from event.data (dot-path)
 * 2. Concatenate values as string (no separator)
 * 3. Append timestamp + events secret
 * 4. SHA-256 hash (plain, NOT HMAC)
 * 5. Compare with signature.checksum
 */
export function verifyWebhookSignature(
  event: WompiWebhookEvent,
  eventsSecret: string
): boolean {
  // Guard: validate minimum payload structure before accessing nested fields
  if (
    !event?.signature?.checksum ||
    typeof event.signature.checksum !== "string" ||
    !Array.isArray(event.signature?.properties) ||
    !event?.data ||
    event.timestamp == null
  ) {
    return false
  }

  const { signature, data, timestamp } = event

  // Build concatenated string from properties
  const values = signature.properties.map((prop) =>
    String(getNestedValue(data, prop) ?? "")
  )
  const toSign = values.join("") + timestamp + eventsSecret

  // SHA-256 plain hash (not HMAC)
  const computed = createHash("sha256").update(toSign).digest("hex")

  // Constant-time comparison to prevent timing attacks
  const received = signature.checksum.toLowerCase()
  const expected = computed.toLowerCase()

  if (expected.length !== received.length) return false

  let result = 0
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ received.charCodeAt(i)
  }
  return result === 0
}

/**
 * Create a Wompi Web Checkout URL for an order.
 *
 * Integrity signature = SHA256(reference + amountInCents + currency + integrityKey)
 * URL: https://checkout.wompi.co/p/?public-key=...&currency=COP&amount-in-cents=...&reference=...&redirect-url=...&signature:integrity=...
 */
export function createCheckoutUrl(params: {
  reference: string
  amountInCents: number
  currency?: string
  redirectUrl: string
}): string {
  const currency = params.currency ?? "COP"
  const integrityString = `${params.reference}${params.amountInCents}${currency}${env.WOMPI_INTEGRITY_KEY()}`
  const signature = createHash("sha256").update(integrityString).digest("hex")

  const url = new URL("https://checkout.wompi.co/p/")
  url.searchParams.set("public-key", env.WOMPI_PUBLIC_KEY())
  url.searchParams.set("currency", currency)
  url.searchParams.set("amount-in-cents", String(params.amountInCents))
  url.searchParams.set("reference", params.reference)
  url.searchParams.set("redirect-url", params.redirectUrl)
  url.searchParams.set("signature:integrity", signature)

  return url.toString()
}

/**
 * Query Wompi API for a transaction by reference.
 * Used for reconciliation and fallback status checks.
 *
 * H-03: Wrapped in try/catch with 10s timeout to prevent crashes
 * when Wompi is unreachable. Returns null on any network error.
 */
export async function queryWompiByReference(
  reference: string
): Promise<{ status: string; transactionId: string } | null> {
  try {
    const res = await fetch(
      `https://sandbox.wompi.co/v1/transactions?reference=${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${env.WOMPI_PRIVATE_KEY()}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }
    )

    if (!res.ok) return null

    const json = await res.json()
    const tx = json.data?.[0]
    if (!tx) return null

    return {
      status: tx.status as string,
      transactionId: tx.id as string,
    }
  } catch {
    return null
  }
}
