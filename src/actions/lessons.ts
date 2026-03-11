"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { ensureCourseMediaFresh, resolveLessonAssetState } from "@/lib/bunny"
import { syncCourseProgressSnapshot } from "@/lib/course-progress"
import { createServerClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { generateSignedUrl } from "@/lib/bunny"
import {
  persistLessonVideoPosition,
  persistCourseLastAccess,
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
        "id, bunny_video_id, bunny_status, video_upload_error, is_free, course_id, courses(id, is_published, slug)"
      )
      .eq("id", lessonId)
      .single()

  // Fetch lesson with course
  let { data: lesson } = await fetchLesson()

  if (!lesson) return { url: "", error: "Leccion no encontrada." }

  let course = Array.isArray(lesson.courses)
    ? lesson.courses[0]
    : lesson.courses

  if (!course?.is_published) {
    return { url: "", error: "Curso no disponible." }
  }

  let playbackState = resolveLessonAssetState(lesson)
  if (!playbackState.isPlayable) {
    await ensureCourseMediaFresh(lesson.course_id, {
      source: "lesson_playback",
    })

    const { data: refreshedLesson } = await fetchLesson()
    if (refreshedLesson) {
      lesson = refreshedLesson
      course = Array.isArray(lesson.courses) ? lesson.courses[0] : lesson.courses
      playbackState = resolveLessonAssetState(lesson)
    }
  }

  if (!playbackState.isPlayable) {
    return {
      url: "",
      error: playbackState.message ?? "El video todavia no esta listo.",
      state: playbackState.state,
    }
  }

  // Free lessons: no auth required
  if (lesson.is_free) {
    const signedUrl = generateSignedUrl(lesson.bunny_video_id)
    return { url: signedUrl, state: playbackState.state }
  }

  // Paid lessons: require auth + enrollment
  const user = await getCurrentUser()
  if (!user) return { url: "", error: "Debes iniciar sesion." }

  const supabase = await createServerClient()

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", lesson.course_id)
    .maybeSingle()

  if (!enrollment) {
    return { url: "", error: "No estas inscrito en este curso." }
  }

  const signedUrl = generateSignedUrl(lesson.bunny_video_id)
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
      return { error: "Leccion no encontrada." }
    }

    return { error: "No estas inscrito en este curso." }
  }

  try {
    await Promise.all([
      persistLessonVideoPosition({
        userId: user.id,
        lessonId,
        position,
      }),
      persistCourseLastAccess({
        userId: user.id,
        courseId: lessonAccess.courseId,
        lessonId,
      }),
    ])
  } catch (error) {
    console.error("[lessons] Failed to save video position:", error)
    return { error: "Error al guardar el progreso del video." }
  }

  revalidateVideoProgressPaths(lessonAccess.courseSlug)

  return {}
}

/**
 * Get the last saved video position for a lesson.
 */
export async function getLastPosition(
  lessonId: string
): Promise<{ position: number }> {
  const user = await getCurrentUser()
  if (!user) return { position: 0 }

  const supabase = await createServerClient()

  const { data } = await supabase
    .from("lesson_progress")
    .select("video_position")
    .eq("user_id", user.id)
    .eq("lesson_id", lessonId)
    .maybeSingle()

  return { position: data?.video_position ?? 0 }
}

export async function markComplete(
  lessonId: string
): Promise<{ error?: string }> {
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
      return { error: "Leccion no encontrada." }
    }

    return { error: "No estas inscrito." }
  }

  const adminClient = createServiceRoleClient()
  const now = new Date().toISOString()

  // Upsert lesson progress
  await adminClient.from("lesson_progress").upsert(
    {
      user_id: user.id,
      lesson_id: lessonId,
      completed: true,
      completed_at: now,
    },
    { onConflict: "user_id,lesson_id" }
  )

  await syncCourseProgressSnapshot({
    supabase: adminClient,
    userId: user.id,
    courseId: lessonAccess.courseId,
    courseSlug: lessonAccess.courseSlug,
    lastLessonId: lessonId,
    lastAccessedAt: now,
  })
  revalidateVideoProgressPaths(lessonAccess.courseSlug)

  return {}
}

/**
 * Mark a lesson as incomplete (toggle back).
 * Recalculates course progress.
 */
export async function markIncomplete(
  lessonId: string
): Promise<{ error?: string }> {
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
      return { error: "Leccion no encontrada." }
    }

    return { error: "No estas inscrito." }
  }

  const adminClient = createServiceRoleClient()

  // Update lesson progress to not completed
  await adminClient
    .from("lesson_progress")
    .update({ completed: false, completed_at: null })
    .eq("user_id", user.id)
    .eq("lesson_id", lessonId)

  await syncCourseProgressSnapshot({
    supabase: adminClient,
    userId: user.id,
    courseId: lessonAccess.courseId,
    courseSlug: lessonAccess.courseSlug,
    lastLessonId: lessonId,
    touchLastAccess: true,
  })
  revalidateVideoProgressPaths(lessonAccess.courseSlug)

  return {}
}
