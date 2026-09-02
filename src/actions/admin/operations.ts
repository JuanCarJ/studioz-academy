"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import {
  normalizePage,
  validAdminOperation,
  UUID_PATTERN,
} from "@/lib/admin-operations"
import type { Json } from "@/types/database"

export async function performAdminOperation(input: {
  action: string
  targetId: string
  reason: string
  courseId?: string
  status?: string
  assign?: string
  notes?: string
}) {
  const admin = await getCurrentUser()
  if (!admin || admin.role !== "admin")
    return { error: "No tienes permiso para realizar esta acción." }
  if (!validAdminOperation(input.action, input.targetId, input.reason))
    return {
      error:
        "Revisa los datos e indica un motivo de entre 5 y 2000 caracteres.",
    }
  if (
    (input.action.startsWith("access.") || input.action === "progress.reset") &&
    !UUID_PATTERN.test(input.courseId ?? "")
  )
    return { error: "Selecciona un curso." }
  if (
    input.action === "contact.update" &&
    !["new", "in_progress", "resolved"].includes(input.status ?? "")
  )
    return { error: "Selecciona el estado del mensaje." }
  const { error } = await createServiceRoleClient().rpc("admin_operate", {
    p_admin_id: admin.id,
    p_action: input.action,
    p_target_id: input.targetId,
    p_input: {
      reason: input.reason.trim(),
      courseId: input.courseId,
      status: input.status,
      assign: input.assign,
      notes: input.notes?.slice(0, 4000),
    } as Json,
  })
  if (error) {
    console.error("[admin.operation]", {
      action: input.action,
      code: error.code,
    })
    if (error.message.includes("approved_purchase_required"))
      return {
        error: "Solo se puede restaurar el acceso de una compra aprobada.",
      }
    if (error.message.includes("protected_account"))
      return { error: "No puedes suspender una cuenta de administración." }
    return {
      error:
        "No se pudo guardar el cambio. No se ha confirmado ninguna modificación; vuelve a intentarlo.",
    }
  }
  revalidatePath("/admin", "layout")
  revalidatePath("/dashboard", "layout")
  revalidatePath("/cursos", "layout")
  return { success: true }
}

export async function getContactInbox(status = "", pageInput = 1) {
  const admin = await getCurrentUser()
  const page = normalizePage(pageInput)
  if (!admin || admin.role !== "admin")
    return { messages: [], totalCount: 0, page, error: "No autorizado." }
  let query = createServiceRoleClient()
    .from("contact_messages")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 25, page * 25 - 1)
  if (["new", "in_progress", "resolved"].includes(status))
    query = query.eq("status", status)
  const { data, count, error } = await query
  return {
    messages: data ?? [],
    totalCount: count ?? 0,
    page,
    error: error
      ? "No pudimos cargar los mensajes. Vuelve a intentarlo."
      : undefined,
  }
}

export async function getSupportNotes(userId: string) {
  const admin = await getCurrentUser()
  if (!admin || admin.role !== "admin" || !UUID_PATTERN.test(userId)) return []
  const { data } = await createServiceRoleClient()
    .from("user_support_notes")
    .select("id,note,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(25)
  return data ?? []
}

export async function getMediaQueue() {
  const admin = await getCurrentUser()
  if (!admin || admin.role !== "admin") return null
  const db = createServiceRoleClient()
  const [lessons, courses, cleanup] = await Promise.all([
    db
      .from("lessons")
      .select(
        "id,title,course_id,bunny_status,video_upload_error,pending_bunny_video_id"
      )
      .or(
        "pending_bunny_video_id.not.is.null,video_upload_error.not.is.null,bunny_status.eq.processing,bunny_status.eq.error"
      )
      .order("updated_at")
      .limit(50),
    db
      .from("courses")
      .select("id,title,preview_upload_error,pending_preview_bunny_video_id")
      .or(
        "pending_preview_bunny_video_id.not.is.null,preview_upload_error.not.is.null,preview_status.eq.processing,preview_status.eq.error"
      )
      .order("updated_at")
      .limit(50),
    db
      .from("bunny_cleanup_queue")
      .select("video_id,requested_at", { count: "exact" })
      .order("requested_at")
      .limit(25),
  ])
  return {
    lessons: lessons.data ?? [],
    courses: courses.data ?? [],
    deferredCount: cleanup.count ?? 0,
    error: Boolean(lessons.error || courses.error || cleanup.error),
  }
}
