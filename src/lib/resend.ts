/**
 * Send an email using Resend.
 */
export async function sendEmail(params: {
  to: string
  subject: string
  react: React.ReactElement
}): Promise<{ id: string } | null> {
  // TODO: Initialize Resend client with RESEND_API_KEY
  console.log("sendEmail", params.to, params.subject)
  return null
}
