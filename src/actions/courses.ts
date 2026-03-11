"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { ensureCourseMediaFresh, resolveCoursePreview } from "@/lib/bunny"
import { getCartItemsForUser } from "@/lib/cart"
import { decorateCourseWithPricing, type PriceableCourse } from "@/lib/pricing"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { createServerClient } from "@/lib/supabase/server"

import type { Course, Instructor, Lesson } from "@/types"
import type { ResolvedCoursePreview } from "@/lib/bunny"

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

type CourseWithInstructor = Omit<Course, "instructor"> & {
  instructor: Pick<Instructor, "id" | "full_name">
  isNew: boolean
}

function mapCourseRows(
  rows: (Course & {
    instructors: Pick<Instructor, "id" | "full_name"> | Pick<Instructor, "id" | "full_name">[]
  })[]
): CourseWithInstructor[] {
  return rows.map((course) => ({
    ...decorateCourseWithPricing(course),
    instructor: Array.isArray(course.instructors)
      ? course.instructors[0]
      : course.instructors,
    isNew: computeIsNew(course.published_at),
  })) as CourseWithInstructor[]
}

function sortCourses(
  rows: CourseWithInstructor[],
  sort: CourseFilters["sort"]
): CourseWithInstructor[] {
  const sorted = [...rows]

  switch (sort) {
    case "price_asc":
      sorted.sort((a, b) => a.price - b.price)
      break
    case "price_desc":
      sorted.sort((a, b) => b.price - a.price)
      break
    case "newest":
    default:
      sorted.sort((a, b) => {
        const aTime = a.published_at ? new Date(a.published_at).getTime() : 0
        const bTime = b.published_at ? new Date(b.published_at).getTime() : 0
        return bTime - aTime
      })
      break
  }

  return sorted
}

export async function getCourses(
  filters?: CourseFilters
): Promise<CourseWithInstructor[]> {
  const supabase = createServiceRoleClient()
  let instructorIdsFromSearch: string[] = []
  const sort = filters?.sort ?? "newest"

  if (filters?.search) {
    const { data: instructorMatches } = await supabase
      .from("instructors")
      .select("id")
      .ilike("full_name", `%${filters.search}%`)

    instructorIdsFromSearch = (instructorMatches ?? []).map((row) => row.id)
  }

  const buildBaseQuery = () => {
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

    switch (sort) {
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

    return query
  }

  if (!filters?.search) {
    const { data, error } = await buildBaseQuery()

    if (error) return []
    return mapCourseRows((data ?? []) as (Course & {
      instructors: Pick<Instructor, "id" | "full_name"> | Pick<Instructor, "id" | "full_name">[]
    })[])
  }

  const term = `*${filters.search}*`
  const [textMatches, instructorMatches] = await Promise.all([
    buildBaseQuery().or(`title.ilike.${term},short_description.ilike.${term}`),
    instructorIdsFromSearch.length > 0
      ? buildBaseQuery().in("instructor_id", instructorIdsFromSearch)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (textMatches.error || instructorMatches.error) return []

  const merged = new Map<string, CourseWithInstructor>()
  for (const row of mapCourseRows(
    [
      ...((textMatches.data ?? []) as (Course & {
        instructors: Pick<Instructor, "id" | "full_name"> | Pick<Instructor, "id" | "full_name">[]
      })[]),
      ...((instructorMatches.data ?? []) as (Course & {
        instructors: Pick<Instructor, "id" | "full_name"> | Pick<Instructor, "id" | "full_name">[]
      })[]),
    ]
  )) {
    merged.set(row.id, row)
  }

  return sortCourses([...merged.values()], sort)
}

export interface CourseDetail extends Course {
  instructor: Instructor
  lessons: Lesson[]
  lessonsCount: number
  totalDuration: number
  enrollmentCount: number
  isEnrolled: boolean
  isInCart: boolean
  resolvedPreview: ResolvedCoursePreview
  enrollmentProgress: { isCompleted: boolean; hasProgress: boolean } | null
}

export async function getCourseBySlug(
  slug: string
): Promise<CourseDetail | null> {
  const publicClient = createServiceRoleClient()

  const courseQuery = () =>
    publicClient
      .from("courses")
      .select("*, instructors(*), lessons(*)")
      .eq("slug", slug)
      .eq("is_published", true)
      .single()

  const { data: initialCourse, error } = await courseQuery()

  if (error || !initialCourse) return null

  const initialLessons = (initialCourse.lessons ?? []) as Lesson[]
  const shouldEnsureFreshMedia =
    !!initialCourse.pending_preview_bunny_video_id ||
    (!!initialCourse.preview_bunny_video_id &&
      initialCourse.preview_status !== "ready") ||
    initialLessons.some(
      (lesson) => !!lesson.pending_bunny_video_id || lesson.bunny_status !== "ready"
    )

  let course = initialCourse
  if (shouldEnsureFreshMedia) {
    const freshnessResult = await ensureCourseMediaFresh(initialCourse.id, {
      source: "public_page",
    })

    if (freshnessResult.touchedCourses.some((item) => item.id === initialCourse.id)) {
      const { data: refreshedCourse, error: refreshedError } = await courseQuery()
      if (!refreshedError && refreshedCourse) {
        course = refreshedCourse
      }
    }
  }

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
  const { count: enrollmentCount } = await publicClient
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("course_id", course.id)

  // Check if current user is enrolled or has course in cart
  let isEnrolled = false
  let isInCart = false
  let enrollmentProgress: { isCompleted: boolean; hasProgress: boolean } | null =
    null

  const user = await getCurrentUser()
  if (user) {
    const supabase = await createServerClient()
    const [enrollmentCheck, cartCheck, progressCheck] = await Promise.all([
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
      supabase
        .from("course_progress")
        .select("completed_lessons, is_completed, last_lesson_id")
        .eq("user_id", user.id)
        .eq("course_id", course.id)
        .maybeSingle(),
    ])
    isEnrolled = !!enrollmentCheck.data
    isInCart = !!cartCheck.data
    if (isEnrolled) {
      enrollmentProgress = {
        isCompleted: progressCheck.data?.is_completed ?? false,
        hasProgress:
          (progressCheck.data?.completed_lessons ?? 0) > 0 ||
          !!progressCheck.data?.last_lesson_id,
      }
    }
  }

  return {
    ...decorateCourseWithPricing(course as unknown as PriceableCourse),
    instructor: instructor as Instructor,
    lessons: sortedLessons,
    lessonsCount: sortedLessons.length,
    totalDuration,
    enrollmentCount: enrollmentCount ?? 0,
    isEnrolled,
    isInCart,
    resolvedPreview: resolveCoursePreview(course as unknown as Course),
    enrollmentProgress,
  } as CourseDetail
}

export async function getCatalogUserState(): Promise<{
  cartCourseIds: string[]
  enrolledCourseIds: string[]
  isAuthenticated: boolean
}> {
  const user = await getCurrentUser()
  if (!user) {
    return { cartCourseIds: [], enrolledCourseIds: [], isAuthenticated: false }
  }

  const supabase = await createServerClient()
  const [cartItems, enrollmentResult] = await Promise.all([
    getCartItemsForUser({
      supabase,
      userId: user.id,
    }),
    supabase
      .from("enrollments")
      .select("course_id")
      .eq("user_id", user.id),
  ])

  return {
    cartCourseIds: cartItems.map((item) => item.course_id),
    enrolledCourseIds: (enrollmentResult.data ?? []).map((r) => r.course_id),
    isAuthenticated: true,
  }
}

export async function getRelatedCourses(
  courseId: string,
  category: string,
  instructorId: string,
  limit = 4
): Promise<(Course & { instructor: Pick<Instructor, "id" | "full_name">; isNew: boolean })[]> {
  const publicClient = createServiceRoleClient()

  // Determine enrolled course IDs for the current user so we can exclude them
  const user = await getCurrentUser()
  let enrolledCourseIds: string[] = []

  if (user) {
    const supabase = await createServerClient()
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("course_id")
      .eq("user_id", user.id)

    enrolledCourseIds = (enrollments ?? []).map((e) => e.course_id)
  }

  // Fetch a larger pool so we can sort and slice after prioritization
  let query = publicClient
    .from("courses")
    .select("*, instructors(id, full_name)")
    .eq("is_published", true)
    .eq("category", category)
    .neq("id", courseId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit * 3) // fetch extra to allow filtering

  if (enrolledCourseIds.length > 0) {
    query = query.not("id", "in", `(${enrolledCourseIds.join(",")})`)
  }

  const { data, error } = await query

  if (error) return []

  const mapped = (data ?? []).map((c) => ({
    ...decorateCourseWithPricing(c as unknown as PriceableCourse),
    instructor: Array.isArray(c.instructors) ? c.instructors[0] : c.instructors,
    isNew: computeIsNew(c.published_at),
  })) as (Course & { instructor: Pick<Instructor, "id" | "full_name">; isNew: boolean })[]

  // Prioritize: same instructor first, then others (both groups already sorted by newest)
  const sameInstructor = mapped.filter((c) => c.instructor_id === instructorId)
  const others = mapped.filter((c) => c.instructor_id !== instructorId)

  return [...sameInstructor, ...others].slice(0, limit)
}

/**
 * H-05: Get list of instructors who have at least one published course.
 * Used for the instructor filter dropdown in the catalog.
 */
export async function getInstructorsForFilter(): Promise<
  Pick<Instructor, "id" | "full_name">[]
> {
  const supabase = createServiceRoleClient()

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
