/**
 * Build a WhatsApp chat URL with a pre-filled message.
 * Uses NEXT_PUBLIC_WHATSAPP_NUMBER from env.
 */
export function buildWhatsappUrl(message: string): string {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? ""
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}
