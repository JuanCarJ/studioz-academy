"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/supabase/auth"
import { enforceRateLimit } from "@/lib/security/rate-limit"
import { scheduleCourseNotification } from "@/lib/course-notifications"

export async function sendNewCourseEmail(
  _previous: { error?: string; success?: string }, formData: FormData
): Promise<{ error?: string; success?: string }> {
  const admin = await getCurrentUser()
  if (!admin || admin.role !== "admin") return { error: "No autorizado." }
  if (formData.get("confirmed") !== "yes") return { error: "Confirma el anuncio antes de programarlo." }
  const courseId = formData.get("courseId")
  const lessonId = formData.get("lessonId")
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (typeof courseId !== "string" || !uuid.test(courseId) || (lessonId && (typeof lessonId !== "string" || !uuid.test(lessonId)))) {
    return { error: "Selecciona un curso y una leccion validos." }
  }
  const rate = await enforceRateLimit({ scope: "course-announcement", key: admin.id, limit: 3, windowSeconds: 60 })
  if (!rate.allowed) return { error: "Espera un minuto antes de programar otro anuncio." }
  try {
    await scheduleCourseNotification(admin.id, courseId, typeof lessonId === "string" && lessonId ? lessonId : undefined)
    revalidatePath(`/admin/cursos/${courseId}/editar`)
    return { success: "Anuncio programado. Los correos se procesaran por grupos; no se han enviado desde esta pantalla." }
  } catch {
    return { error: "No pudimos programar el anuncio. Comprueba que el curso este publicado y la leccion este lista." }
  }
}
