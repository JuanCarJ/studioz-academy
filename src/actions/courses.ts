"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import {
  COURSE_MEDIA_HEALTH_THROTTLE_MS,
  ensureCourseMediaFresh,
  resolveCoursePreview,
  shouldRefreshCourseMediaHealth,
} from "@/lib/bunny"
import { getCartItemsForUser } from "@/lib/cart"
import { decorateCourseWithPricing, type PriceableCourse } from "@/lib/pricing"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { createServerClient } from "@/lib/supabase/server"
import { CATALOG_PAGE_SIZE, decodeCatalogPage, normalizeCatalogFilters, type CatalogPage, type CatalogQuery } from "@/lib/catalog"

import type { Course, Instructor, Lesson } from "@/types"
import type { ResolvedCoursePreview } from "@/lib/bunny"

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function computeIsNew(publishedAt: string | null): boolean {
  if (!publishedAt) return false
  return Date.now() - new Date(publishedAt).getTime() < THIRTY_DAYS_MS
}

export async function getCourses(
  query?: CatalogQuery
): Promise<CatalogPage> {
  const filters = normalizeCatalogFilters(query)
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc("search_public_courses", {
    p_category: filters.category, p_search: filters.search,
    p_instructor: filters.instructor || null, p_sort: filters.sort,
    p_page: filters.page, p_page_size: CATALOG_PAGE_SIZE,
  })
  if (error) throw new Error("catalog_unavailable")
  return decodeCatalogPage(data)
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
  const shouldEnsureFreshMedia = shouldRefreshCourseMediaHealth(
    initialCourse,
    initialLessons,
    COURSE_MEDIA_HEALTH_THROTTLE_MS
  )

  let course = initialCourse
  if (shouldEnsureFreshMedia) {
    const freshnessResult = await ensureCourseMediaFresh(initialCourse.id, {
      source: "public_page",
      throttleMs: COURSE_MEDIA_HEALTH_THROTTLE_MS,
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

export async function getCatalogUserState(courseIds: string[]): Promise<{
  cartCourseIds: string[]
  enrolledCourseIds: string[]
  isAuthenticated: boolean
}> {
  const user = await getCurrentUser()
  if (!user) {
    return { cartCourseIds: [], enrolledCourseIds: [], isAuthenticated: false }
  }

  const supabase = await createServerClient()
  // Only courses currently rendered need flags; do not load every enrollment.
  if (!courseIds.length) return { cartCourseIds: [], enrolledCourseIds: [], isAuthenticated: true }
  const visibleCourseIds = [...new Set(courseIds)].slice(0, CATALOG_PAGE_SIZE)
  const [cartItems, enrollmentResult] = await Promise.all([
    getCartItemsForUser({
      supabase,
      userId: user.id,
      courseIds: visibleCourseIds,
      strict: true,
    }),
    supabase
      .from("enrollments")
      .select("course_id")
      .eq("user_id", user.id)
      .in("course_id", visibleCourseIds),
  ])

  if (enrollmentResult.error) throw new Error("catalog_user_state_unavailable")

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

  const { data, error } = await supabase.rpc("public_catalog_instructors")
  if (error || !Array.isArray(data)) throw new Error("catalog_unavailable")
  return data as Pick<Instructor, "id" | "full_name">[]
}
