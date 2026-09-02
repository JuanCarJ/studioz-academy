import "server-only"

/** Bound allocation even when a sender omits or lies about Content-Length. */
export async function readPaymentWebhookBody(request: Request, limit = 65_536): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) return null
  const reader = request.body?.getReader()
  if (!reader) return ""
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); return null }
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString("utf8")
  } finally { reader.releaseLock() }
}
