"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"

import type { Course, Instructor, Lesson } from "@/types"

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function computeIsNew(publishedAt: string | null): boolean {
  if (!publishedAt) return false
  return Date.now() - new Date(publishedAt).getTime() < THIRTY_DAYS_MS
}

interface CourseFilters {
  category?: string
  search?: string
  instructor?: string
  sort?: "newest" | "price_asc" | "price_desc"
}

export async function getCourses(
  filters?: CourseFilters
): Promise<(Course & { instructor: Pick<Instructor, "id" | "full_name"> })[]> {
  const supabase = await createServerClient()

  let query = supabase
    .from("courses")
    .select("*, instructors(id, full_name)")
    .eq("is_published", true)

  if (filters?.category) {
    query = query.eq("category", filters.category)
  }

  if (filters?.instructor) {
    query = query.eq("instructor_id", filters.instructor)
  }

  if (filters?.search) {
    const term = `%${filters.search}%`
    // H-05: Also search by instructor name via the joined instructors table
    query = query.or(
      `title.ilike.${term},short_description.ilike.${term},instructors.full_name.ilike.${term}`
    )
  }

  // Sorting
  switch (filters?.sort) {
    case "price_asc":
      query = query.order("price", { ascending: true })
      break
    case "price_desc":
      query = query.order("price", { ascending: false })
      break
    case "newest":
    default:
      query = query.order("published_at", { ascending: false, nullsFirst: false })
      break
  }

  const { data, error } = await query

  if (error) return []

  return (data ?? []).map((c) => ({
    ...c,
    instructor: Array.isArray(c.instructors) ? c.instructors[0] : c.instructors,
    isNew: computeIsNew(c.published_at),
  })) as (Course & { instructor: Pick<Instructor, "id" | "full_name">; isNew: boolean })[]
}

export interface CourseDetail extends Course {
  instructor: Instructor
  lessons: Lesson[]
  lessonsCount: number
  totalDuration: number
  enrollmentCount: number
  isEnrolled: boolean
  isInCart: boolean
}

export async function getCourseBySlug(
  slug: string
): Promise<CourseDetail | null> {
  const supabase = await createServerClient()

  const { data: course, error } = await supabase
    .from("courses")
    .select("*, instructors(*), lessons(*)")
    .eq("slug", slug)
    .eq("is_published", true)
    .single()

  if (error || !course) return null

  const instructor = Array.isArray(course.instructors)
    ? course.instructors[0]
    : course.instructors

  const lessons = (course.lessons ?? []) as Lesson[]
  const sortedLessons = [...lessons].sort(
    (a, b) => a.sort_order - b.sort_order
  )

  const totalDuration = sortedLessons.reduce(
    (acc, l) => acc + (l.duration_seconds || 0),
    0
  )

  // Enrollment count
  const { count: enrollmentCount } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("course_id", course.id)

  // Check if current user is enrolled or has course in cart
  let isEnrolled = false
  let isInCart = false

  const user = await getCurrentUser()
  if (user) {
    const [enrollmentCheck, cartCheck] = await Promise.all([
      supabase
        .from("enrollments")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", course.id)
        .maybeSingle(),
      supabase
        .from("cart_items")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", course.id)
        .maybeSingle(),
    ])
    isEnrolled = !!enrollmentCheck.data
    isInCart = !!cartCheck.data
  }

  return {
    ...course,
    instructor: instructor as Instructor,
    lessons: sortedLessons,
    lessonsCount: sortedLessons.length,
    totalDuration,
    enrollmentCount: enrollmentCount ?? 0,
    isEnrolled,
    isInCart,
  } as CourseDetail
}

export async function getRelatedCourses(
  courseId: string,
  category: string,
  limit = 4
): Promise<(Course & { instructor: Pick<Instructor, "id" | "full_name">; isNew: boolean })[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("courses")
    .select("*, instructors(id, full_name)")
    .eq("is_published", true)
    .eq("category", category)
    .neq("id", courseId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) return []

  return (data ?? []).map((c) => ({
    ...c,
    instructor: Array.isArray(c.instructors) ? c.instructors[0] : c.instructors,
    isNew: computeIsNew(c.published_at),
  })) as (Course & { instructor: Pick<Instructor, "id" | "full_name">; isNew: boolean })[]
}

/**
 * H-05: Get list of instructors who have at least one published course.
 * Used for the instructor filter dropdown in the catalog.
 */
export async function getInstructorsForFilter(): Promise<
  Pick<Instructor, "id" | "full_name">[]
> {
  const supabase = await createServerClient()

  const { data: courses } = await supabase
    .from("courses")
    .select("instructor_id")
    .eq("is_published", true)

  if (!courses?.length) return []

  const uniqueIds = [...new Set(courses.map((c) => c.instructor_id))]

  const { data: instructors } = await supabase
    .from("instructors")
    .select("id, full_name")
    .in("id", uniqueIds)
    .order("full_name")

  return (instructors ?? []) as Pick<Instructor, "id" | "full_name">[]
}
