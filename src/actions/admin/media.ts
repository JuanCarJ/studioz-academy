"use server"

import {
  ensureCourseMediaFresh,
  revalidateTouchedCoursePaths,
} from "@/lib/bunny"
import { decorateCourseWithPricing, type PriceableCourse } from "@/lib/pricing"
import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { enforceRateLimit } from "@/lib/security/rate-limit"
import { revalidatePath } from "next/cache"

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

export async function retryCourseMediaProcessing(
  _previous: { error?: string; success?: string },
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }
  const courseId = formData.get("courseId")
  if (typeof courseId !== "string" || !/^[0-9a-f-]{36}$/i.test(courseId)) {
    return { error: "Curso no valido." }
  }
  const rate = await enforceRateLimit({ scope: "media-recheck", key: admin.id, limit: 3, windowSeconds: 60 })
  if (!rate.allowed) return { error: "Espera un minuto antes de volver a consultar los videos." }
  try {
    const result = await ensureCourseMediaFresh(courseId, { source: "admin_page" })
    revalidateTouchedCoursePaths(result.touchedCourses)
    revalidatePath("/admin/videos")
    if (result.errors) return { error: "Algunos videos siguen sin estar disponibles. Revisa la carga desde el curso." }
    return { success: "Estado actualizado. Los videos en preparacion pueden tardar unos minutos." }
  } catch {
    return { error: "No pudimos comprobar los videos. Intenta de nuevo mas tarde." }
  }
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

  const [{ data: course, error: courseError }, { data: lessons, error: lessonsError }] = await Promise.all([
    supabase.from("courses").select("*").eq("id", courseId).single(),
    supabase
      .from("lessons")
      .select("*")
      .eq("course_id", courseId)
      .order("sort_order", { ascending: true }),
  ])

  if (courseError || lessonsError) return { error: "No se pudo actualizar el estado de los videos. Intenta de nuevo." }
  return {
    course: course
      ? (decorateCourseWithPricing(course as typeof course & PriceableCourse) as Course)
      : undefined,
    lessons: ((lessons ?? []) as Lesson[]) ?? [],
    updated: result.reconciled > 0,
  }
}
