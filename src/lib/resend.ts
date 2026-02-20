import { Resend } from "resend"

import { env } from "@/lib/env"

let resendClient: Resend | null = null

function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY())
  }
  return resendClient
}

/**
 * Send an email using Resend.
 * Returns the email ID on success, null on failure (logs the error).
 */
export async function sendEmail(params: {
  to: string
  subject: string
  react: React.ReactElement
  from?: string
}): Promise<{ id: string } | null> {
  const resend = getResendClient()

  const { data, error } = await resend.emails.send({
    from: params.from ?? "Studio Z Academy <no-reply@studiozacademy.com>",
    to: params.to,
    subject: params.subject,
    react: params.react,
  })

  if (error) {
    console.error("[resend] Failed to send email:", error)
    return null
  }

  return data
}
