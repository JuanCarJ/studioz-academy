import { createHash } from "crypto"

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
 */
export function createCheckoutUrl(params: {
  reference: string
  amountInCents: number
  currency?: string
  redirectUrl: string
}): string {
  // TODO: Build Wompi checkout URL with public key (Increment 2)
  console.log("createCheckoutUrl", params)
  return ""
}
