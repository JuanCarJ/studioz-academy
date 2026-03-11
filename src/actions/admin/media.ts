"use server"

import {
  ensureCourseMediaFresh,
  revalidateTouchedCoursePaths,
} from "@/lib/bunny"
import { decorateCourseWithPricing } from "@/lib/pricing"
import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"

import type { Course, Lesson } from "@/types"

interface CourseMediaStatusResponse {
  error?: string
  course?: Course
  lessons?: Lesson[]
  updated?: boolean
}

async function verifyAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") {
    return null
  }
  return user
}

export async function refreshCourseMediaStatus(
  courseId: string
): Promise<CourseMediaStatusResponse> {
  const admin = await verifyAdmin()
  if (!admin) {
    return { error: "No autorizado." }
  }

  const result = await ensureCourseMediaFresh(courseId, {
    source: "admin_page",
  })
  revalidateTouchedCoursePaths(result.touchedCourses)

  const supabase = createServiceRoleClient()

  const [{ data: course }, { data: lessons }] = await Promise.all([
    supabase.from("courses").select("*").eq("id", courseId).single(),
    supabase
      .from("lessons")
      .select("*")
      .eq("course_id", courseId)
      .order("sort_order", { ascending: true }),
  ])

  return {
    course: course
      ? (decorateCourseWithPricing(course as Course) as Course)
      : undefined,
    lessons: ((lessons ?? []) as Lesson[]) ?? [],
    updated: result.reconciled > 0,
  }
}
