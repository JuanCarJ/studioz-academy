"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { ensureCourseMediaFresh, resolveLessonAssetState } from "@/lib/bunny"
import { createServerClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { generateSignedUrl } from "@/lib/bunny"
import { enforcePublicRateLimit, enforceRateLimit } from "@/lib/security/rate-limit"
import {
  persistLessonVideoPosition,
  persistLessonCompletion,
  revalidateVideoProgressPaths,
  resolveEnrolledLessonAccess,
} from "@/lib/video-progress"

export async function getSignedVideoUrl(
  lessonId: string
): Promise<{ url: string; error?: string; state?: string }> {
  const adminClient = createServiceRoleClient()
  const fetchLesson = () =>
    adminClient
      .from("lessons")
      .select(
        "id, bunny_video_id, bunny_status, video_upload_error, is_free, course_id, courses(id, is_published, archived_at, slug)"
      )
      .eq("id", lessonId)
      .single()

  // Fetch lesson with course
  let { data: lesson } = await fetchLesson()

  if (!lesson) return { url: "", error: "Leccion no encontrada." }

  // Public samples require a published course. Enrollment remains the access
  // authority for existing students after a course is unpublished/archived.
  const user = await getCurrentUser()
  const canPlay = async (candidate: typeof lesson) => {
    if (!candidate) return false
    const candidateCourse = Array.isArray(candidate.courses)
      ? candidate.courses[0] : candidate.courses
    if (!candidateCourse) return false
    if (candidate.is_free && candidateCourse.is_published && !candidateCourse.archived_at) return true
    if (!user) return false
    const supabase = await createServerClient()
    const { data: enrollment, error } = await supabase.from("enrollments")
      .select("id").eq("user_id", user.id)
      .eq("course_id", candidate.course_id).maybeSingle()
    return !error && !!enrollment
  }
  if (!await canPlay(lesson)) {
    return { url: "", error: user ? "No tienes acceso a esta leccion." : "Inicia sesion para acceder a esta leccion." }
  }
  const rate = user
    ? await enforceRateLimit({ scope: "video-url", key: user.id, limit: 60, windowSeconds: 60 })
    : await enforcePublicRateLimit("video-preview", "", 15, 60)
  if (!rate.allowed) return { url: "", error: "Espera un minuto antes de volver a cargar el video." }

  let playbackState = resolveLessonAssetState(lesson)
  if (!playbackState.isPlayable) {
    try {
      await ensureCourseMediaFresh(lesson.course_id, { source: "lesson_playback" })
    } catch {
      return { url: "", error: "No pudimos comprobar el video. Intenta de nuevo en unos minutos." }
    }

    const { data: refreshedLesson } = await fetchLesson()
    if (refreshedLesson) {
      lesson = refreshedLesson
      if (!await canPlay(lesson)) {
        return { url: "", error: "No tienes acceso a esta leccion." }
      }
      playbackState = resolveLessonAssetState(lesson)
    } else {
      return { url: "", error: "Leccion no disponible." }
    }
  }

  if (!playbackState.isPlayable) {
    return {
      url: "",
      error: playbackState.message ?? "El video todavia no esta listo.",
      state: playbackState.state,
    }
  }

  if (!playbackState.videoId) {
    return {
      url: "",
      error: playbackState.message ?? "El video no esta disponible.",
      state: playbackState.state,
    }
  }

  const signedUrl = generateSignedUrl(playbackState.videoId)
  return { url: signedUrl, state: playbackState.state }
}

/**
 * Save the current video playback position for a lesson.
 * Called on pause, on lesson change, and debounced every 30s during playback.
 */
export async function saveVideoPosition(
  lessonId: string,
  position: number
): Promise<{ error?: string }> {
  if (!Number.isFinite(position) || position < 0 || position > 2147483647) {
    return { error: "La posición del video no es válida. Vuelve a cargar la lección." }
  }
  const user = await getCurrentUser()
  if (!user) return { error: "AUTH_REQUIRED" }

  const supabase = await createServerClient()
  const lessonAccess = await resolveEnrolledLessonAccess({
    supabase,
    userId: user.id,
    lessonId,
  })

  if (!lessonAccess.ok) {
    if (lessonAccess.reason === "lesson_not_found") {
      return { error: "Lección no encontrada." }
    }

    return { error: "No estás inscrito en este curso." }
  }

  try {
    await persistLessonVideoPosition({ userId: user.id, lessonId, position })
  } catch (error) {
    console.error("[lessons] Failed to save video position:", error)
    return { error: "No pudimos guardar tu avance. Inténtalo de nuevo." }
  }

  revalidateVideoProgressPaths(lessonAccess.courseSlug)

  return {}
}

/**
 * Get the last saved video position for a lesson.
 */
export async function getLastPosition(
  lessonId: string
): Promise<{ position: number; error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { position: 0, error: "Inicia sesión de nuevo para recuperar tu progreso." }

  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("lesson_progress")
    .select("video_position")
    .eq("user_id", user.id)
    .eq("lesson_id", lessonId)
    .maybeSingle()

  if (error) return { position: 0, error: "No pudimos recuperar dónde ibas." }
  return { position: data?.video_position ?? 0 }
}

async function changeLessonCompletion(lessonId: string, completed: boolean): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: "Inicia sesión de nuevo para guardar tu progreso." }
  const supabase = await createServerClient()
  const access = await resolveEnrolledLessonAccess({ supabase, userId: user.id, lessonId })
  if (!access.ok) return { error: "No pudimos verificar tu acceso a esta lección. Recarga la página." }
  try {
    await persistLessonCompletion({ userId: user.id, lessonId, completed })
  } catch {
    return { error: "No pudimos actualizar esta lección. Vuelve a pulsar el botón para intentarlo." }
  }
  revalidateVideoProgressPaths(access.courseSlug)
  return {}
}

export async function markComplete(lessonId: string): Promise<{ error?: string }> {
  return changeLessonCompletion(lessonId, true)
}

export async function markIncomplete(lessonId: string): Promise<{ error?: string }> {
  return changeLessonCompletion(lessonId, false)
}
