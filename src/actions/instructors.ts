"use server"

import { createServerClient } from "@/lib/supabase/server"

import type { Course, Instructor } from "@/types"

export interface InstructorWithStats extends Instructor {
  publishedCoursesCount: number
}

export async function getInstructorBySlug(
  slug: string
): Promise<InstructorWithStats | null> {
  const supabase = await createServerClient()

  const { data: instructor, error } = await supabase
    .from("instructors")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single()

  if (error || !instructor) return null

  const { count } = await supabase
    .from("courses")
    .select("id", { count: "exact", head: true })
    .eq("instructor_id", instructor.id)
    .eq("is_published", true)

  return {
    ...(instructor as Instructor),
    publishedCoursesCount: count ?? 0,
  }
}

export async function getInstructorCourses(
  instructorId: string
): Promise<(Course & { instructor: Pick<Instructor, "id" | "full_name"> })[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("courses")
    .select("*, instructors(id, full_name)")
    .eq("instructor_id", instructorId)
    .eq("is_published", true)
    .order("published_at", { ascending: false, nullsFirst: false })

  if (error || !data) return []

  return data.map((c) => ({
    ...c,
    instructor: Array.isArray(c.instructors) ? c.instructors[0] : c.instructors,
  })) as (Course & { instructor: Pick<Instructor, "id" | "full_name"> })[]
}
