"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { createBunnyVideo, deleteBunnyVideo } from "@/lib/bunny"
import { env } from "@/lib/env"

import type { Lesson } from "@/types"

export interface LessonActionState {
  error?: string
  success?: boolean
  /** Returned to client for direct upload to Bunny (create flow only). */
  uploadUrl?: string
  videoId?: string
}

async function verifyAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") {
    return null
  }
  return user
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Fetch all lessons for a course ordered by sort_order ascending.
 */
export async function getLessonsForCourse(courseId: string): Promise<Lesson[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("lessons")
    .select("*")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true })

  if (error) return []

  return (data ?? []) as Lesson[]
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Create a lesson for a course.
 *
 * Returns uploadUrl + videoId so the client can stream the file directly
 * to Bunny CDN without routing through Vercel.
 *
 * Flow:
 *   1. Validate fields
 *   2. Create video entry in Bunny (get videoId + uploadUrl)
 *   3. Insert lesson row in Supabase (bunny_video_id is set immediately)
 *   4. Return uploadUrl to client — client uploads the actual file bytes
 */
export async function createLesson(
  courseId: string,
  formData: FormData
): Promise<LessonActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const title = (formData.get("title") as string)?.trim()
  const description = (formData.get("description") as string)?.trim() || null
  const isFree = formData.get("isFree") === "on"
  const durationRaw = formData.get("durationSeconds") as string
  const durationSeconds = durationRaw ? Math.round(Number(durationRaw)) : 0

  if (!title) {
    return { error: "El titulo de la leccion es obligatorio." }
  }

  // Create video entry in Bunny to get videoId + uploadUrl
  let videoId: string
  let uploadUrl: string
  try {
    const result = await createBunnyVideo(title)
    videoId = result.videoId
    uploadUrl = result.uploadUrl
  } catch {
    return { error: "No se pudo crear el registro de video en Bunny. Intenta de nuevo." }
  }

  const libraryId = env.BUNNY_LIBRARY_ID()
  const adminSupabase = createServiceRoleClient()

  // Determine next sort_order
  const { data: lastLesson } = await adminSupabase
    .from("lessons")
    .select("sort_order")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextSortOrder = lastLesson ? lastLesson.sort_order + 1 : 1

  const { error: insertError } = await adminSupabase.from("lessons").insert({
    course_id: courseId,
    title,
    description,
    is_free: isFree,
    bunny_video_id: videoId,
    bunny_library_id: libraryId,
    duration_seconds: durationSeconds,
    sort_order: nextSortOrder,
  })

  if (insertError) {
    // Best-effort: delete the Bunny entry since we could not persist the row
    await deleteBunnyVideo(videoId).catch(() => undefined)
    return { error: "No se pudo guardar la leccion. Intenta de nuevo." }
  }

  revalidatePath(`/admin/cursos/${courseId}/editar`)
  revalidatePath(`/cursos`)

  return { success: true, uploadUrl, videoId }
}

/**
 * Update lesson metadata. Does not touch the Bunny video entry.
 */
export async function updateLesson(
  lessonId: string,
  formData: FormData
): Promise<LessonActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const title = (formData.get("title") as string)?.trim()
  const description = (formData.get("description") as string)?.trim() || null
  const isFree = formData.get("isFree") === "on"
  const durationRaw = formData.get("durationSeconds") as string
  const durationSeconds = durationRaw ? Math.round(Number(durationRaw)) : undefined

  if (!title) {
    return { error: "El titulo de la leccion es obligatorio." }
  }

  const adminSupabase = createServiceRoleClient()

  // Fetch lesson to get course_id for revalidation
  const { data: lesson } = await adminSupabase
    .from("lessons")
    .select("course_id")
    .eq("id", lessonId)
    .single()

  if (!lesson) return { error: "Leccion no encontrada." }

  const updateData: Record<string, unknown> = {
    title,
    description,
    is_free: isFree,
  }

  if (durationSeconds !== undefined && !isNaN(durationSeconds)) {
    updateData.duration_seconds = durationSeconds
  }

  const { error } = await adminSupabase
    .from("lessons")
    .update(updateData)
    .eq("id", lessonId)

  if (error) {
    return { error: "No se pudo actualizar la leccion." }
  }

  revalidatePath(`/admin/cursos/${lesson.course_id}/editar`)
  revalidatePath(`/cursos`)

  return { success: true }
}

/**
 * Delete a lesson.
 *
 * Cascade order:
 *   1. Delete lesson_progress rows for this lesson
 *   2. Recalculate course_progress for all enrolled students
 *   3. Delete the lesson row (triggers DB cascades if configured)
 *   4. Delete Bunny video (best-effort)
 *   5. Revalidate
 */
export async function deleteLesson(
  lessonId: string
): Promise<LessonActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const adminSupabase = createServiceRoleClient()

  // Fetch lesson details before deleting
  const { data: lesson } = await adminSupabase
    .from("lessons")
    .select("course_id, bunny_video_id")
    .eq("id", lessonId)
    .single()

  if (!lesson) return { error: "Leccion no encontrada." }

  const { course_id: courseId, bunny_video_id: bunnyVideoId } = lesson

  // Step 1: Delete lesson_progress rows for this lesson
  await adminSupabase.from("lesson_progress").delete().eq("lesson_id", lessonId)

  // Step 2: Delete the lesson row
  const { error: deleteError } = await adminSupabase
    .from("lessons")
    .delete()
    .eq("id", lessonId)

  if (deleteError) {
    return { error: "No se pudo eliminar la leccion." }
  }

  // Step 3: Recalculate course_progress for all enrolled students in this course
  await recalculateCourseProgress(adminSupabase, courseId)

  // Step 4: Delete Bunny video (best-effort — do not fail the action if this errors)
  if (bunnyVideoId) {
    await deleteBunnyVideo(bunnyVideoId).catch(() => undefined)
  }

  revalidatePath(`/admin/cursos/${courseId}/editar`)
  revalidatePath(`/cursos`)

  return { success: true }
}

/**
 * Reorder lessons for a course by updating sort_order based on the provided
 * array position (index 0 = sort_order 1).
 */
export async function reorderLessons(
  courseId: string,
  lessonIds: string[]
): Promise<LessonActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  if (lessonIds.length === 0) return { success: true }

  const adminSupabase = createServiceRoleClient()

  // Execute updates sequentially to preserve order
  for (let i = 0; i < lessonIds.length; i++) {
    const { error } = await adminSupabase
      .from("lessons")
      .update({ sort_order: i + 1 })
      .eq("id", lessonIds[i])
      .eq("course_id", courseId)

    if (error) {
      return { error: "No se pudo reordenar las lecciones." }
    }
  }

  revalidatePath(`/admin/cursos/${courseId}/editar`)
  revalidatePath(`/cursos`)

  return { success: true }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recalculate course_progress.completed_lessons for all students enrolled
 * in a given course after a lesson deletion.
 */
async function recalculateCourseProgress(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  courseId: string
): Promise<void> {
  // Get remaining lesson IDs for this course
  const { data: remainingLessons } = await supabase
    .from("lessons")
    .select("id")
    .eq("course_id", courseId)

  const remainingIds: string[] =
    (remainingLessons ?? []).map((l: { id: string }) => l.id)

  const totalRemaining = remainingIds.length

  // Get all course_progress rows for this course
  const { data: progressRows } = await supabase
    .from("course_progress")
    .select("id, user_id, last_lesson_id")
    .eq("course_id", courseId)

  if (!progressRows || progressRows.length === 0) return

  for (const progress of progressRows as {
    id: string
    user_id: string
    last_lesson_id: string | null
  }[]) {
    // Count completed lessons that still exist
    let completedCount = 0
    if (remainingIds.length > 0) {
      const { count } = await supabase
        .from("lesson_progress")
        .select("id", { count: "exact", head: true })
        .eq("user_id", progress.user_id)
        .eq("completed", true)
        .in("lesson_id", remainingIds)

      completedCount = count ?? 0
    }

    const isCompleted =
      totalRemaining > 0 && completedCount === totalRemaining

    // If last_lesson_id was the deleted lesson, clear it
    const lastLessonId =
      progress.last_lesson_id && remainingIds.includes(progress.last_lesson_id)
        ? progress.last_lesson_id
        : null

    await supabase
      .from("course_progress")
      .update({
        completed_lessons: completedCount,
        is_completed: isCompleted,
        last_lesson_id: lastLessonId,
      })
      .eq("id", progress.id)
  }
}
