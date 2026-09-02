"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { persistCourseLastAccess, revalidateVideoProgressPaths, resolveEnrolledLessonAccess } from "@/lib/video-progress"

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
    lastLessonTitle: string | null
    newLessons: number
    hasVideoProgress: boolean
    lastAccessedAt: string
  }
  enrolledAt: string
  source: string
}

export interface StudentCoursesResult {
  courses: EnrolledCourseWithProgress[]
  total: number
  totalCourses: number
  completedCourses: number
  page: number
  pageSize: number
  error?: string
}

export async function getEnrolledCoursesWithProgress(input: {
  page?: number
  pageSize?: number
  filter?: string
  sort?: string
} = {}): Promise<StudentCoursesResult> {
  const page = Number.isFinite(input.page) ? Math.max(1, Math.min(10000, Math.floor(input.page!))) : 1
  const pageSize = Number.isFinite(input.pageSize) ? Math.max(1, Math.min(48, Math.floor(input.pageSize!))) : 12
  const empty = { courses: [], total: 0, totalCourses: 0, completedCourses: 0, page, pageSize }
  const user = await getCurrentUser()
  if (!user) return { ...empty, error: "AUTH_REQUIRED" }
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc("get_student_courses", {
    p_filter: ["active", "completed"].includes(input.filter ?? "") ? input.filter : "all",
    p_sort: ["lastAccessed", "progressDesc", "progressAsc", "enrolledAt"].includes(input.sort ?? "") ? input.sort : "lastAccessed",
    p_page: page,
    p_page_size: pageSize,
  })
  if (error || !data) return { ...empty, error: "No pudimos cargar tus cursos. Inténtalo de nuevo." }
  return data as unknown as StudentCoursesResult
}

export async function updateLastLesson(courseId: string, lessonId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: "Inicia sesión de nuevo para guardar tu progreso." }
  const supabase = await createServerClient()
  const access = await resolveEnrolledLessonAccess({ supabase, userId: user.id, lessonId, expectedCourseId: courseId })
  if (!access.ok) return { error: "No pudimos verificar tu acceso a esta lección. Recarga la página." }
  try {
    await persistCourseLastAccess({ userId: user.id, courseId: access.courseId, lessonId })
  } catch {
    return { error: "No pudimos guardar dónde vas. Inténtalo de nuevo." }
  }
  revalidateVideoProgressPaths(access.courseSlug)
  return {}
}

export async function resetCourseProgress(courseId: string, confirmed: boolean): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: "Inicia sesión de nuevo para reiniciar tu progreso." }
  if (confirmed !== true) return { error: "Confirma que quieres reiniciar tu progreso." }
  const supabase = await createServerClient()
  const { error } = await supabase.rpc("reset_course_progress", { p_course_id: courseId })
  if (error) return { error: "No pudimos reiniciar tu progreso. Inténtalo de nuevo." }
  revalidateVideoProgressPaths(null)
  return {}
}
