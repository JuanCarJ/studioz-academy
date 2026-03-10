import type { SupabaseClient } from "@supabase/supabase-js"

import { getBestDiscount } from "@/lib/discounts"

import type { DiscountRule, Instructor } from "@/types"
import type { Database } from "@/types/database"

type RlsClient = SupabaseClient<Database>
type CourseRow = Database["public"]["Tables"]["courses"]["Row"]
type CartRow = Database["public"]["Tables"]["cart_items"]["Row"]
type CartCourseCategory = "baile" | "tatuaje"

interface CartCourse extends CourseRow {
  category: CartCourseCategory
  instructor: Pick<Instructor, "id" | "full_name">
}

export type AddCourseToCartErrorCode =
  | "ALREADY_ENROLLED"
  | "ALREADY_IN_CART"
  | "COURSE_IS_FREE"
  | "COURSE_UNAVAILABLE"
  | "ADD_FAILED"

export interface CartItemWithCourse {
  id: string
  user_id: string
  course_id: string
  added_at: string
  course: CartCourse
}

export interface AddCourseToCartResult {
  success: boolean
  code?: AddCourseToCartErrorCode
  courseSlug: string | null
}

export interface ResolvedCartState {
  items: CartItemWithCourse[]
  subtotal: number
  discountAmount: number
  discountRule: DiscountRule | null
  total: number
}

function mapCartItem(
  item: CartRow & {
    courses:
      | (CourseRow & {
          instructors:
            | Pick<Instructor, "id" | "full_name">
            | Pick<Instructor, "id" | "full_name">[]
            | null
        })
      | (CourseRow & {
          instructors:
            | Pick<Instructor, "id" | "full_name">
            | Pick<Instructor, "id" | "full_name">[]
            | null
        })[]
      | null
  }
): CartItemWithCourse | null {
  const rawCourse = Array.isArray(item.courses) ? item.courses[0] : item.courses
  if (!rawCourse) return null

  const instructor = Array.isArray(rawCourse.instructors)
    ? rawCourse.instructors[0]
    : rawCourse.instructors

  if (!instructor) return null

  if (rawCourse.category !== "baile" && rawCourse.category !== "tatuaje") {
    return null
  }

  const { instructors: _instructors, ...course } = rawCourse

  return {
    id: item.id,
    user_id: item.user_id,
    course_id: item.course_id,
    added_at: item.added_at,
    course: {
      ...course,
      category: rawCourse.category,
      instructor,
    },
  }
}

export async function addCourseToCartForUser(input: {
  supabase: RlsClient
  userId: string
  courseId: string
}): Promise<AddCourseToCartResult> {
  const { data: course, error: courseError } = await input.supabase
    .from("courses")
    .select("id, slug, is_free, is_published")
    .eq("id", input.courseId)
    .maybeSingle()

  if (courseError || !course || !course.is_published) {
    return {
      success: false,
      code: "COURSE_UNAVAILABLE",
      courseSlug: course?.slug ?? null,
    }
  }

  if (course.is_free) {
    return {
      success: false,
      code: "COURSE_IS_FREE",
      courseSlug: course.slug,
    }
  }

  const { data: enrollment } = await input.supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", input.userId)
    .eq("course_id", input.courseId)
    .maybeSingle()

  if (enrollment) {
    return {
      success: false,
      code: "ALREADY_ENROLLED",
      courseSlug: course.slug,
    }
  }

  const { data: existing } = await input.supabase
    .from("cart_items")
    .select("id")
    .eq("user_id", input.userId)
    .eq("course_id", input.courseId)
    .maybeSingle()

  if (existing) {
    return {
      success: false,
      code: "ALREADY_IN_CART",
      courseSlug: course.slug,
    }
  }

  const { error: insertError } = await input.supabase.from("cart_items").insert({
    user_id: input.userId,
    course_id: input.courseId,
  })

  if (insertError) {
    const duplicate = insertError.code === "23505"
    return {
      success: false,
      code: duplicate ? "ALREADY_IN_CART" : "ADD_FAILED",
      courseSlug: course.slug,
    }
  }

  return {
    success: true,
    courseSlug: course.slug,
  }
}

export async function getCartItemsForUser(input: {
  supabase: RlsClient
  userId: string
}): Promise<CartItemWithCourse[]> {
  const { data, error } = await input.supabase
    .from("cart_items")
    .select("*, courses(*, instructors(id, full_name))")
    .eq("user_id", input.userId)
    .order("added_at", { ascending: false })

  if (error || !data) return []

  const validItems: CartItemWithCourse[] = []
  const invalidItemIds: string[] = []

  for (const item of data) {
    const mappedItem = mapCartItem(item)
    if (!mappedItem) {
      invalidItemIds.push(item.id)
      continue
    }

    if (!mappedItem.course.is_published || mappedItem.course.is_free) {
      invalidItemIds.push(item.id)
      continue
    }

    validItems.push(mappedItem)
  }

  if (invalidItemIds.length > 0) {
    await input.supabase.from("cart_items").delete().in("id", invalidItemIds)
  }

  return validItems
}

export async function resolveCartStateForUser(input: {
  supabase: RlsClient
  userId: string
}): Promise<ResolvedCartState> {
  const items = await getCartItemsForUser(input)

  const subtotal = items.reduce((acc, item) => acc + item.course.price, 0)

  const { data: rules } = await input.supabase
    .from("discount_rules")
    .select("*")
    .eq("is_active", true)

  const discount = getBestDiscount(
    items.map((item) => ({
      category: item.course.category,
      price: item.course.price,
      isFree: item.course.is_free,
    })),
    (rules ?? []) as DiscountRule[]
  )

  return {
    items,
    subtotal,
    discountAmount: discount.amount,
    discountRule: discount.rule,
    total: subtotal - discount.amount,
  }
}

export function stripAddToCartParam(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return null
  }

  const url = new URL(path, "http://localhost")
  url.searchParams.delete("addToCart")

  const nextPath = `${url.pathname}${url.search}`
  return nextPath || "/"
}

export function resolvePostAddToCartRedirect(input: {
  result: AddCourseToCartResult
  redirectTo: string | null
  fallbackPath: string
}): string {
  const sanitizedRedirect =
    stripAddToCartParam(input.redirectTo) ?? input.fallbackPath

  if (input.result.success || input.result.code === "ALREADY_IN_CART") {
    return "/carrito"
  }

  if (input.result.code === "ALREADY_ENROLLED" && input.result.courseSlug) {
    return `/dashboard/cursos/${input.result.courseSlug}`
  }

  if (input.result.code === "COURSE_IS_FREE" && input.result.courseSlug) {
    return `/cursos/${input.result.courseSlug}`
  }

  return sanitizedRedirect
}

export function getCartErrorMessage(error: string): string {
  switch (error) {
    case "COURSE_IS_FREE":
      return "Este curso ahora es gratuito. Inscribete desde la pagina del curso."
    case "COURSE_UNAVAILABLE":
      return "Este curso ya no esta disponible."
    case "ADD_FAILED":
      return "No se pudo agregar al carrito."
    default:
      return error
  }
}
