"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import {
  createBunnyTusUploadSession,
  createBunnyVideo,
  deleteBunnyVideo,
} from "@/lib/bunny"
import { syncCourseProgressForEnrolledUsers } from "@/lib/course-progress"
import { env } from "@/lib/env"

import type { BunnyUploadSession, Lesson } from "@/types"

export interface LessonActionState {
  error?: string
  success?: boolean
  /** Returned to client for direct resumable upload to Bunny. */
  uploadSession?: BunnyUploadSession
  videoId?: string
  lessonId?: string
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
 * Returns an upload session + videoId so the client can upload file bytes
 * directly to Bunny Stream via TUS without routing through Vercel.
 *
 * Flow:
 *   1. Validate fields
 *   2. Create video entry in Bunny and sign a TUS upload session
 *   3. Insert lesson row in Supabase (bunny_video_id is set immediately)
 *   4. Return uploadSession to client — browser uploads the actual file bytes
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

  if (!title) {
    return { error: "El titulo de la leccion es obligatorio." }
  }

  let videoId: string
  let uploadSession: BunnyUploadSession
  try {
    videoId = await createBunnyVideo(title)
    uploadSession = createBunnyTusUploadSession(videoId)
  } catch {
    return { error: "No se pudo crear el registro de video en Bunny. Intenta de nuevo." }
  }

  const libraryId = env.BUNNY_LIBRARY_ID()
  const adminSupabase = createServiceRoleClient()
  const now = new Date().toISOString()

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
    bunny_status: "processing",
    bunny_last_checked_at: null,
    bunny_last_state_changed_at: now,
    pending_bunny_status: "none",
    video_upload_error: null,
    duration_seconds: 0,
    sort_order: nextSortOrder,
  })

  if (insertError) {
    // Best-effort: delete the Bunny entry since we could not persist the row
    await deleteBunnyVideo(videoId).catch(() => undefined)
    return { error: "No se pudo guardar la leccion. Intenta de nuevo." }
  }

  revalidatePath(`/admin/cursos/${courseId}/editar`)
  revalidatePath(`/cursos`)

  const { courseSlug } = await syncCourseProgressForEnrolledUsers({
    supabase: adminSupabase,
    courseId,
  })
  revalidatePath("/dashboard")
  if (courseSlug) {
    revalidatePath(`/cursos/${courseSlug}`)
    revalidatePath(`/dashboard/cursos/${courseSlug}`)
  }

  const { data: lesson } = await adminSupabase
    .from("lessons")
    .select("id")
    .eq("course_id", courseId)
    .eq("bunny_video_id", videoId)
    .maybeSingle()

  return { success: true, uploadSession, videoId, lessonId: lesson?.id }
}

/**
 * Update lesson metadata only.
 * Video replacement is handled in a separate 2-step flow:
 *   1. prepareLessonVideoReplacement
 *   2. commitLessonVideoReplacement
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

  if (!title) {
    return { error: "El titulo de la leccion es obligatorio." }
  }

  const adminSupabase = createServiceRoleClient()

  // Fetch lesson to get course_id for revalidation
  const { data: lesson } = await adminSupabase
    .from("lessons")
    .select("course_id, courses(slug)")
    .eq("id", lessonId)
    .single()

  if (!lesson) return { error: "Leccion no encontrada." }

  const updateData: Record<string, unknown> = {
    title,
    description,
    is_free: isFree,
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
  revalidatePath("/dashboard")
  const course = Array.isArray(lesson.courses) ? lesson.courses[0] : lesson.courses
  if (course?.slug) {
    revalidatePath(`/cursos/${course.slug}`)
    revalidatePath(`/dashboard/cursos/${course.slug}`)
  }

  return { success: true }
}

/**
 * Step 1 of video replacement:
 * Create a new Bunny video entry and return a TUS upload session.
 * This does not mutate the lesson row yet.
 */
export async function prepareLessonVideoReplacement(
  lessonId: string,
  titleHint?: string
): Promise<LessonActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const adminSupabase = createServiceRoleClient()
  const { data: lesson } = await adminSupabase
    .from("lessons")
    .select("id, title")
    .eq("id", lessonId)
    .single()

  if (!lesson) return { error: "Leccion no encontrada." }

  const effectiveTitle = titleHint?.trim() || lesson.title || "Leccion"

  try {
    const videoId = await createBunnyVideo(effectiveTitle)
    return {
      success: true,
      uploadSession: createBunnyTusUploadSession(videoId),
      videoId,
    }
  } catch {
    return { error: "No se pudo preparar el nuevo video en Bunny. Intenta de nuevo." }
  }
}

/**
 * Step 2 of video replacement:
 * After successful upload, persist the new video ID in DB and delete old video.
 */
export async function commitLessonVideoReplacement(
  lessonId: string,
  newVideoId: string
): Promise<LessonActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  if (!newVideoId?.trim()) {
    return { error: "Video invalido para reemplazo." }
  }

  const adminSupabase = createServiceRoleClient()
  const { data: lesson } = await adminSupabase
    .from("lessons")
    .select("course_id, bunny_video_id, bunny_status")
    .eq("id", lessonId)
    .single()

  if (!lesson) return { error: "Leccion no encontrada." }

  const libraryId = env.BUNNY_LIBRARY_ID()
  const now = new Date().toISOString()

  const updateData =
    lesson.bunny_video_id && lesson.bunny_status === "ready"
      ? {
          pending_bunny_video_id: newVideoId,
          pending_bunny_library_id: libraryId,
          pending_bunny_status: "processing",
          bunny_last_checked_at: null,
          bunny_last_state_changed_at: now,
          video_upload_error: null,
        }
      : {
          bunny_video_id: newVideoId,
          bunny_library_id: libraryId,
          bunny_status: "processing",
          bunny_last_checked_at: null,
          bunny_last_state_changed_at: now,
          pending_bunny_video_id: null,
          pending_bunny_library_id: null,
          pending_bunny_status: "none",
          video_upload_error: null,
        }

  const { error } = await adminSupabase
    .from("lessons")
    .update(updateData)
    .eq("id", lessonId)

  if (error) {
    return { error: "No se pudo confirmar el reemplazo de video." }
  }

  revalidatePath(`/admin/cursos/${lesson.course_id}/editar`)
  revalidatePath(`/cursos`)

  return { success: true }
}

export async function markLessonUploadFailed(
  lessonId: string
): Promise<LessonActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const adminSupabase = createServiceRoleClient()
  const { data: lesson } = await adminSupabase
    .from("lessons")
    .select("course_id")
    .eq("id", lessonId)
    .single()

  if (!lesson) return { error: "Leccion no encontrada." }

  await adminSupabase
    .from("lessons")
    .update({
      bunny_status: "error",
      bunny_last_checked_at: null,
      bunny_last_state_changed_at: new Date().toISOString(),
      video_upload_error: "No se pudo completar la subida del archivo.",
    })
    .eq("id", lessonId)

  revalidatePath(`/admin/cursos/${lesson.course_id}/editar`)
  revalidatePath(`/cursos`)

  return { success: true }
}

/**
 * Best-effort cleanup for orphan Bunny videos that were prepared but not used.
 */
export async function discardPreparedVideo(videoId: string): Promise<void> {
  const admin = await verifyAdmin()
  if (!admin) return

  if (!videoId?.trim()) return

  await deleteBunnyVideo(videoId).catch(() => undefined)
}

/**
 * Delete a lesson.
 *
 * Cascade order:
 *   1. Delete lesson_progress rows for this lesson
 *   2. Delete the lesson row (triggers DB cascades if configured)
 *   3. Recalculate course_progress for all enrolled students
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
    .select("course_id, bunny_video_id, pending_bunny_video_id")
    .eq("id", lessonId)
    .single()

  if (!lesson) return { error: "Leccion no encontrada." }

  const {
    course_id: courseId,
    bunny_video_id: bunnyVideoId,
    pending_bunny_video_id: pendingVideoId,
  } = lesson

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
  const { courseSlug } = await syncCourseProgressForEnrolledUsers({
    supabase: adminSupabase,
    courseId,
  })

  // Step 4: Delete Bunny video (best-effort — do not fail the action if this errors)
  if (bunnyVideoId) {
    await deleteBunnyVideo(bunnyVideoId).catch(() => undefined)
  }

  if (pendingVideoId && pendingVideoId !== bunnyVideoId) {
    await deleteBunnyVideo(pendingVideoId).catch(() => undefined)
  }

  revalidatePath(`/admin/cursos/${courseId}/editar`)
  revalidatePath(`/cursos`)
  revalidatePath("/dashboard")
  if (courseSlug) {
    revalidatePath(`/dashboard/cursos/${courseSlug}`)
  }

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
