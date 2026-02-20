"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"

import type { CourseProgress } from "@/types"

export interface EnrolledCourseWithProgress {
  course: {
    id: string
    title: string
    slug: string
    thumbnail_url: string | null
    category: "baile" | "tatuaje"
    is_free: boolean
    instructor: { full_name: string } | null
    totalLessons: number
  }
  progress: {
    completedLessons: number
    totalLessons: number
    percentage: number
    isCompleted: boolean
    lastLessonId: string | null
    lastAccessedAt: string
  }
  enrolledAt: string
  source: string
}

/**
 * Get all enrolled courses for the current user with progress data.
 * Used by the "Mi Aprendizaje" dashboard page (US-023).
 */
export async function getEnrolledCoursesWithProgress(): Promise<{
  courses: EnrolledCourseWithProgress[]
  error?: string
}> {
  const user = await getCurrentUser()
  if (!user) return { courses: [], error: "AUTH_REQUIRED" }

  const supabase = await createServerClient()

  // Fetch enrollments with course + instructor
  const { data: enrollments, error: enrollError } = await supabase
    .from("enrollments")
    .select(`
      id,
      course_id,
      enrolled_at,
      source,
      courses (
        id,
        title,
        slug,
        thumbnail_url,
        category,
        is_free,
        instructors (full_name)
      )
    `)
    .eq("user_id", user.id)
    .order("enrolled_at", { ascending: false })

  if (enrollError || !enrollments) {
    return { courses: [], error: "Error al cargar cursos." }
  }

  const courseIds = enrollments.map((e) => e.course_id)
  if (courseIds.length === 0) return { courses: [] }

  // Fetch progress and lesson counts in parallel
  const [{ data: progressData }, { data: lessonsData }] = await Promise.all([
    supabase
      .from("course_progress")
      .select("*")
      .eq("user_id", user.id)
      .in("course_id", courseIds),
    supabase
      .from("lessons")
      .select("id, course_id")
      .in("course_id", courseIds),
  ])

  // Build lesson count map
  const lessonCountMap = new Map<string, number>()
  for (const lesson of lessonsData ?? []) {
    lessonCountMap.set(lesson.course_id, (lessonCountMap.get(lesson.course_id) ?? 0) + 1)
  }

  // Build progress map
  const progressMap = new Map<string, CourseProgress>()
  for (const p of progressData ?? []) {
    progressMap.set(p.course_id, p as CourseProgress)
  }

  const courses: EnrolledCourseWithProgress[] = enrollments
    .filter((e) => e.courses)
    .map((e) => {
      const course = e.courses as unknown as {
        id: string
        title: string
        slug: string
        thumbnail_url: string | null
        category: "baile" | "tatuaje"
        is_free: boolean
        instructors: { full_name: string } | null
      }

      const totalLessons = lessonCountMap.get(course.id) ?? 0
      const progress = progressMap.get(course.id)
      const completedLessons = progress?.completed_lessons ?? 0

      return {
        course: {
          id: course.id,
          title: course.title,
          slug: course.slug,
          thumbnail_url: course.thumbnail_url,
          category: course.category,
          is_free: course.is_free,
          instructor: course.instructors,
          totalLessons,
        },
        progress: {
          completedLessons,
          totalLessons,
          percentage: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
          isCompleted: progress?.is_completed ?? false,
          lastLessonId: progress?.last_lesson_id ?? null,
          lastAccessedAt: progress?.last_accessed_at ?? e.enrolled_at,
        },
        enrolledAt: e.enrolled_at,
        source: e.source,
      }
    })

  return { courses }
}

/**
 * Update the last accessed lesson and timestamp for a course.
 */
export async function updateLastLesson(
  courseId: string,
  lessonId: string
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: "AUTH_REQUIRED" }

  const supabase = await createServerClient()

  const { error } = await supabase
    .from("course_progress")
    .upsert(
      {
        user_id: user.id,
        course_id: courseId,
        last_lesson_id: lessonId,
        last_accessed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,course_id" }
    )

  if (error) {
    console.error("[progress] Failed to update last lesson:", error)
    return { error: "Error al actualizar progreso." }
  }

  return {}
}
