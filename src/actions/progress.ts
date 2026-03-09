"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { resolveEffectiveCourseProgress } from "@/lib/course-progress"
import { createServerClient } from "@/lib/supabase/server"
import {
  persistCourseLastAccess,
  revalidateVideoProgressPaths,
  resolveEnrolledLessonAccess,
} from "@/lib/video-progress"

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
    hasVideoProgress: boolean
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

  const lessonIdToCourseId = new Map<string, string>()
  for (const lesson of lessonsData ?? []) {
    lessonIdToCourseId.set(lesson.id, lesson.course_id)
  }

  const lessonProgressIds = Array.from(lessonIdToCourseId.keys())
  const { data: lessonProgressData } =
    lessonProgressIds.length > 0
      ? await supabase
          .from("lesson_progress")
          .select("lesson_id, completed, video_position")
          .eq("user_id", user.id)
          .in("lesson_id", lessonProgressIds)
      : {
          data: [] as Array<{
            lesson_id: string
            completed: boolean | null
            video_position: number | null
          }>,
        }

  // Build lesson count map
  const lessonCountMap = new Map<string, number>()
  for (const lesson of lessonsData ?? []) {
    lessonCountMap.set(lesson.course_id, (lessonCountMap.get(lesson.course_id) ?? 0) + 1)
  }

  const courseLessonIdsMap = new Map<string, Set<string>>()
  for (const lesson of lessonsData ?? []) {
    const existingIds = courseLessonIdsMap.get(lesson.course_id) ?? new Set<string>()
    existingIds.add(lesson.id)
    courseLessonIdsMap.set(lesson.course_id, existingIds)
  }

  const courseIdsWithVideoProgress = new Set<string>()
  const completedLessonCountMap = new Map<string, number>()
  for (const lessonProgress of lessonProgressData ?? []) {
    const courseId = lessonIdToCourseId.get(lessonProgress.lesson_id)
    if (courseId) {
      if ((lessonProgress.video_position ?? 0) > 0) {
        courseIdsWithVideoProgress.add(courseId)
      }
      if (lessonProgress.completed) {
        completedLessonCountMap.set(courseId, (completedLessonCountMap.get(courseId) ?? 0) + 1)
      }
    }
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
      const effectiveProgress = resolveEffectiveCourseProgress({
        totalLessons,
        actualCompletedLessons: completedLessonCountMap.get(course.id) ?? 0,
        persistedProgress: progress
          ? {
              completed_lessons: progress.completed_lessons,
              is_completed: progress.is_completed,
            }
          : null,
      })
      const validLessonIds = courseLessonIdsMap.get(course.id) ?? new Set<string>()
      const lastLessonId =
        progress?.last_lesson_id && validLessonIds.has(progress.last_lesson_id)
          ? progress.last_lesson_id
          : null

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
          completedLessons: effectiveProgress.completedLessons,
          totalLessons,
          percentage: effectiveProgress.percentage,
          isCompleted: effectiveProgress.isCompleted,
          lastLessonId,
          hasVideoProgress: courseIdsWithVideoProgress.has(course.id),
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
  const lessonAccess = await resolveEnrolledLessonAccess({
    supabase,
    userId: user.id,
    lessonId,
    expectedCourseId: courseId,
  })

  if (!lessonAccess.ok) {
    if (lessonAccess.reason === "lesson_not_found" || lessonAccess.reason === "course_mismatch") {
      return { error: "Leccion no encontrada." }
    }

    return { error: "No estas inscrito en este curso." }
  }

  try {
    await persistCourseLastAccess({
      userId: user.id,
      courseId: lessonAccess.courseId,
      lessonId,
    })
  } catch (error) {
    console.error("[progress] Failed to update last lesson:", error)
    return { error: "Error al actualizar progreso." }
  }

  revalidateVideoProgressPaths(lessonAccess.courseSlug)

  return {}
}
