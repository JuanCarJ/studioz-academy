/**
 * Create a Wompi Web Checkout URL for an order.
 */
export function createCheckoutUrl(params: {
  reference: string
  amountInCents: number
  currency?: string
  redirectUrl: string
}): string {
  // TODO: Build Wompi checkout URL with public key
  console.log("createCheckoutUrl", params)
  return ""
}

/**
 * Verify the HMAC-SHA256 signature of a Wompi webhook event.
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  // TODO: HMAC-SHA256 verification
  console.log("verifyWebhookSignature", signature)
  return false
}
