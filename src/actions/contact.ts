"use server"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import {
  enforcePublicRateLimit,
  RATE_LIMIT_MESSAGE,
} from "@/lib/security/rate-limit"

export async function submitContactMessage(input: {
  name: string
  email: string
  subject: string
  message: string
  website?: string
}) {
  if (input.website) return { success: true }
  const name = input.name.trim(),
    email = input.email.trim().toLowerCase(),
    message = input.message.trim()
  if (
    name.length < 2 ||
    name.length > 80 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    message.length < 10 ||
    message.length > 4000 ||
    ![
      "Clases de baile",
      "Tatuajes",
      "Cursos online",
      "Ayuda con una compra",
    ].includes(input.subject)
  ) {
    return {
      error:
        "Revisa tu nombre y correo. El mensaje debe tener entre 10 y 4000 caracteres.",
    }
  }
  const limit = await enforcePublicRateLimit("contact", email, 3, 3600)
  if (!limit.allowed) return { error: RATE_LIMIT_MESSAGE }
  const { error } = await createServiceRoleClient()
    .from("contact_messages")
    .insert({ name, email, subject: input.subject, message })
  if (error)
    return {
      error:
        "No pudimos enviar tu mensaje. Inténtalo más tarde o escríbenos por WhatsApp.",
    }
  return { success: true }
}
