"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { reconcilePendingBunnyAssets } from "@/lib/bunny"

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

function revalidateTouchedCoursePaths(
  touchedCourses: Array<{ id: string; slug: string }>
) {
  if (touchedCourses.length === 0) {
    return
  }

  revalidatePath("/admin/cursos")
  revalidatePath("/cursos")

  for (const course of touchedCourses) {
    revalidatePath(`/admin/cursos/${course.id}/editar`)
    revalidatePath(`/cursos/${course.slug}`)
    revalidatePath(`/dashboard/cursos/${course.slug}`)
  }
}

export async function refreshCourseMediaStatus(
  courseId: string
): Promise<CourseMediaStatusResponse> {
  const admin = await verifyAdmin()
  if (!admin) {
    return { error: "No autorizado." }
  }

  const result = await reconcilePendingBunnyAssets({ courseId })
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
    course: (course ?? undefined) as Course | undefined,
    lessons: ((lessons ?? []) as Lesson[]) ?? [],
    updated: result.reconciled > 0,
  }
}
