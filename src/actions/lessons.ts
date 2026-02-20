"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { generateSignedUrl } from "@/lib/bunny"

export async function getSignedVideoUrl(
  lessonId: string
): Promise<{ url: string; error?: string }> {
  const supabase = await createServerClient()

  // Fetch lesson with course
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, bunny_video_id, is_free, course_id, courses(id, is_published, slug)")
    .eq("id", lessonId)
    .single()

  if (!lesson) return { url: "", error: "Leccion no encontrada." }

  const course = Array.isArray(lesson.courses)
    ? lesson.courses[0]
    : lesson.courses

  if (!course?.is_published) {
    return { url: "", error: "Curso no disponible." }
  }

  // Free lessons: no auth required
  if (lesson.is_free) {
    const signedUrl = generateSignedUrl(lesson.bunny_video_id)
    return { url: signedUrl }
  }

  // Paid lessons: require auth + enrollment
  const user = await getCurrentUser()
  if (!user) return { url: "", error: "Debes iniciar sesion." }

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
  return { url: signedUrl }
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

  // Verify enrollment
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, course_id")
    .eq("id", lessonId)
    .single()

  if (!lesson) return { error: "Leccion no encontrada." }

  const adminClient = createServiceRoleClient()

  await adminClient.from("lesson_progress").upsert(
    {
      user_id: user.id,
      lesson_id: lessonId,
      video_position: Math.floor(position),
    },
    { onConflict: "user_id,lesson_id" }
  )

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

  // Verify enrollment
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, course_id, courses(slug)")
    .eq("id", lessonId)
    .single()

  if (!lesson) return { error: "Leccion no encontrada." }

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", lesson.course_id)
    .maybeSingle()

  if (!enrollment) return { error: "No estas inscrito." }

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

  // Recalculate course progress
  const { count: completedCount } = await adminClient
    .from("lesson_progress")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("completed", true)
    .in(
      "lesson_id",
      (
        await adminClient
          .from("lessons")
          .select("id")
          .eq("course_id", lesson.course_id)
      ).data?.map((l) => l.id) ?? []
    )

  const { count: totalLessons } = await adminClient
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .eq("course_id", lesson.course_id)

  const isCompleted =
    (completedCount ?? 0) > 0 &&
    totalLessons != null &&
    (completedCount ?? 0) >= totalLessons

  await adminClient.from("course_progress").upsert(
    {
      user_id: user.id,
      course_id: lesson.course_id,
      last_lesson_id: lessonId,
      completed_lessons: completedCount ?? 0,
      is_completed: isCompleted,
      last_accessed_at: now,
    },
    { onConflict: "user_id,course_id" }
  )

  const courseSlug = Array.isArray(lesson.courses)
    ? lesson.courses[0]?.slug
    : (lesson.courses as { slug: string })?.slug

  if (courseSlug) {
    revalidatePath(`/dashboard/cursos/${courseSlug}`)
  }

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

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, course_id, courses(slug)")
    .eq("id", lessonId)
    .single()

  if (!lesson) return { error: "Leccion no encontrada." }

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", lesson.course_id)
    .maybeSingle()

  if (!enrollment) return { error: "No estas inscrito." }

  const adminClient = createServiceRoleClient()

  // Update lesson progress to not completed
  await adminClient
    .from("lesson_progress")
    .update({ completed: false, completed_at: null })
    .eq("user_id", user.id)
    .eq("lesson_id", lessonId)

  // Recalculate course progress
  const { count: completedCount } = await adminClient
    .from("lesson_progress")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("completed", true)
    .in(
      "lesson_id",
      (
        await adminClient
          .from("lessons")
          .select("id")
          .eq("course_id", lesson.course_id)
      ).data?.map((l) => l.id) ?? []
    )

  await adminClient.from("course_progress").upsert(
    {
      user_id: user.id,
      course_id: lesson.course_id,
      completed_lessons: completedCount ?? 0,
      is_completed: false,
      last_accessed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,course_id" }
  )

  const courseSlug = Array.isArray(lesson.courses)
    ? lesson.courses[0]?.slug
    : (lesson.courses as { slug: string })?.slug

  if (courseSlug) {
    revalidatePath(`/dashboard/cursos/${courseSlug}`)
  }

  return {}
}
