"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/admin"

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

  // Verify course is free and published
  const { data: course } = await supabase
    .from("courses")
    .select("id, is_free, is_published, slug")
    .eq("id", courseId)
    .single()

  if (!course) return { error: "Curso no encontrado." }
  if (!course.is_free) return { error: "Este curso no es gratuito." }
  if (!course.is_published) return { error: "Este curso no esta disponible." }

  // Check existing enrollment (idempotency)
  const { data: existing } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle()

  if (existing) return { success: true }

  // Use service role for insert (RLS doesn't have INSERT for users on enrollments)
  const adminClient = createServiceRoleClient()

  const { error: enrollError } = await adminClient.from("enrollments").insert({
    user_id: user.id,
    course_id: courseId,
    source: "free",
  })

  if (enrollError) {
    return { error: "No se pudo completar la inscripcion." }
  }

  // Initialize course_progress
  await adminClient.from("course_progress").upsert(
    {
      user_id: user.id,
      course_id: courseId,
      completed_lessons: 0,
      is_completed: false,
      last_accessed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,course_id" }
  )

  revalidatePath(`/cursos/${course.slug}`)
  revalidatePath("/dashboard")
  return { success: true }
}

export async function getEnrollments(): Promise<
  (Enrollment & { course: Course })[]
> {
  const user = await getCurrentUser()
  if (!user) return []

  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("enrollments")
    .select("*, courses(*)")
    .eq("user_id", user.id)
    .order("enrolled_at", { ascending: false })

  if (error || !data) return []

  return data.map((e) => ({
    ...e,
    course: Array.isArray(e.courses) ? e.courses[0] : e.courses,
  })) as (Enrollment & { course: Course })[]
}
