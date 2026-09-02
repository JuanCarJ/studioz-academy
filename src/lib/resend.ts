import "server-only"
import { render } from "@react-email/components"
import { env } from "@/lib/env"

export async function sendEmail(params: {
  to: string; subject: string; react: React.ReactElement; from?: string; idempotencyKey: string
}): Promise<{ id: string } | null> {
  const html = await render(params.react)
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY()}`, "Content-Type": "application/json", "Idempotency-Key": params.idempotencyKey },
    body: JSON.stringify({ from: params.from ?? "Studio Z Academy <no-reply@studiozacademy.com>", to: params.to, subject: params.subject, html }),
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) return null
  const body = await response.json()
  return typeof body?.id === "string" ? { id: body.id } : null
}
