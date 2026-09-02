"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { decorateCourseWithPricing } from "@/lib/pricing"
import {
  enrollFreeCourseForUser,
  type EnrollFreeCourseErrorCode,
} from "@/lib/enrollments"
import { createServerClient } from "@/lib/supabase/server"

import type { Enrollment, Course } from "@/types"

export interface EnrollmentActionResult {
  error?: string
  success?: boolean
}

export async function enrollFree(
  courseId: string
): Promise<EnrollmentActionResult> {
  const user = await getCurrentUser()
  if (!user) return { error: "AUTH_REQUIRED" }

  const supabase = await createServerClient()
  const result = await enrollFreeCourseForUser({
    supabase,
    userId: user.id,
    courseId,
  })

  if (result.success) {
    return { success: true }
  }

  return { error: getEnrollFreeErrorMessage(result.code) }
}

function getEnrollFreeErrorMessage(code?: EnrollFreeCourseErrorCode): string {
  switch (code) {
    case "COURSE_NOT_FOUND":
      return "Curso no encontrado."
    case "COURSE_UNAVAILABLE":
      return "Este curso no está disponible."
    case "COURSE_NOT_FREE":
      return "Este curso no es gratuito."
    case "ENROLL_FAILED":
    default:
      return "No se pudo completar la inscripción. Inténtalo de nuevo."
  }
}

export async function getEnrollments(input: { page?: number; pageSize?: number } = {}): Promise<
  (Enrollment & { course: Course })[]
> {
  const user = await getCurrentUser()
  if (!user) return []

  const supabase = await createServerClient()
  const page = Number.isFinite(input.page) ? Math.max(1, Math.min(10000, Math.floor(input.page!))) : 1
  const pageSize = Number.isFinite(input.pageSize) ? Math.max(1, Math.min(48, Math.floor(input.pageSize!))) : 12

  const { data, error } = await supabase
    .from("enrollments")
    .select("*, courses(*)")
    .eq("user_id", user.id)
    .order("enrolled_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (error || !data) return []

  return data.filter((e) => e.courses).map((e) => ({
    ...e,
    course: decorateCourseWithPricing(
      (Array.isArray(e.courses) ? e.courses[0] : e.courses) as Course
    ),
  })) as (Enrollment & { course: Course })[]
}
