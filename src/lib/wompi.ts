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

export interface WompiTransactionLookup {
  transactionId: string
  reference: string
  status: string
  amountInCents: number
  currency: string
  paymentMethodType: string | null
  customerEmail: string | null
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
  customerEmail?: string | null
  customerFullName?: string | null
  customerPhoneNumber?: string | null
  customerPhoneNumberPrefix?: string | null
}): string {
  const currency = params.currency ?? "COP"
  const integrityString = `${params.reference}${params.amountInCents}${currency}${env.WOMPI_INTEGRITY_KEY()}`
  const signature = createHash("sha256").update(integrityString).digest("hex")

  const url = new URL(env.WOMPI_CHECKOUT_URL())
  url.searchParams.set("public-key", env.WOMPI_PUBLIC_KEY())
  url.searchParams.set("currency", currency)
  url.searchParams.set("amount-in-cents", String(params.amountInCents))
  url.searchParams.set("reference", params.reference)
  url.searchParams.set("redirect-url", params.redirectUrl)
  url.searchParams.set("signature:integrity", signature)

  if (params.customerEmail) {
    url.searchParams.set("customer-data:email", params.customerEmail)
  }

  if (params.customerFullName) {
    url.searchParams.set("customer-data:full-name", params.customerFullName)
  }

  if (params.customerPhoneNumber && params.customerPhoneNumberPrefix) {
    url.searchParams.set("customer-data:phone-number", params.customerPhoneNumber)
    url.searchParams.set(
      "customer-data:phone-number-prefix",
      params.customerPhoneNumberPrefix
    )
  }

  return url.toString()
}

function parseTransaction(
  tx: Record<string, unknown> | null | undefined
): WompiTransactionLookup | null {
  if (!tx) return null

  const transactionId =
    typeof tx.id === "string" && tx.id.trim().length > 0 ? tx.id : null
  const reference =
    typeof tx.reference === "string" && tx.reference.trim().length > 0
      ? tx.reference
      : null
  const status =
    typeof tx.status === "string" && tx.status.trim().length > 0 ? tx.status : null
  const amountInCents =
    typeof tx.amount_in_cents === "number" ? tx.amount_in_cents : null
  const currency =
    typeof tx.currency === "string" && tx.currency.trim().length > 0
      ? tx.currency
      : null

  if (
    !transactionId ||
    !reference ||
    !status ||
    amountInCents === null ||
    !currency
  ) {
    return null
  }

  return {
    transactionId,
    reference,
    status,
    amountInCents,
    currency,
    paymentMethodType:
      typeof tx.payment_method_type === "string" ? tx.payment_method_type : null,
    customerEmail: typeof tx.customer_email === "string" ? tx.customer_email : null,
  }
}

async function readTransactionFromWompi(
  url: string,
  authToken: string
): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${authToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) return null

  const json = await res.json()
  const data = json.data

  if (Array.isArray(data)) {
    return (data[0] as Record<string, unknown> | undefined) ?? null
  }

  if (data && typeof data === "object") {
    return data as Record<string, unknown>
  }

  return null
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
): Promise<WompiTransactionLookup | null> {
  try {
    const tx = await readTransactionFromWompi(
      `${env.WOMPI_API_BASE_URL()}/transactions?reference=${encodeURIComponent(reference)}`,
      env.WOMPI_PRIVATE_KEY()
    )
    return parseTransaction(tx)
  } catch {
    return null
  }
}

/**
 * Query Wompi API for a transaction by transaction id.
 * This is the documented polling endpoint and uses the public key.
 */
export async function queryWompiTransactionById(
  transactionId: string
): Promise<WompiTransactionLookup | null> {
  try {
    const tx = await readTransactionFromWompi(
      `${env.WOMPI_API_BASE_URL()}/transactions/${encodeURIComponent(transactionId)}`,
      env.WOMPI_PUBLIC_KEY()
    )
    return parseTransaction(tx)
  } catch {
    return null
  }
}
