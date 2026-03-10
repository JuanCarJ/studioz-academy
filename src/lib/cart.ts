import type { SupabaseClient } from "@supabase/supabase-js"

import { calculatePricing, decorateCourseWithPricing } from "@/lib/pricing"

import type { DiscountRule, Instructor, PricingLine } from "@/types"
import type { Database } from "@/types/database"

type RlsClient = SupabaseClient<Database>
type CourseRow = Database["public"]["Tables"]["courses"]["Row"]
type CartRow = Database["public"]["Tables"]["cart_items"]["Row"]
type CartCourseCategory = "baile" | "tatuaje"

interface CartCourse extends CourseRow {
  category: CartCourseCategory
  instructor: Pick<Instructor, "id" | "full_name">
  list_price: number
  current_price: number
  has_course_discount: boolean
  course_discount_amount: number
  course_discount_label: string | null
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
  listPrice: number
  courseDiscountAmount: number
  priceAfterCourseDiscount: number
  comboDiscountAmount: number
  finalPrice: number
  coursePromotionLabel: string | null
  comboPromotionLabel: string | null
  course: CartCourse
}

export interface AddCourseToCartResult {
  success: boolean
  code?: AddCourseToCartErrorCode
  courseSlug: string | null
}

export interface ResolvedCartState {
  items: CartItemWithCourse[]
  listSubtotal: number
  subtotal: number
  courseDiscountAmount: number
  comboDiscountAmount: number
  discountAmount: number
  appliedDiscountLines: PricingLine[]
  primaryComboRuleIds: string[]
  primaryComboRuleName: string | null
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
): Omit<CartItemWithCourse, "listPrice" | "courseDiscountAmount" | "priceAfterCourseDiscount" | "comboDiscountAmount" | "finalPrice" | "coursePromotionLabel" | "comboPromotionLabel"> | null {
  const rawCourse = Array.isArray(item.courses) ? item.courses[0] : item.courses
  if (!rawCourse) return null

  const instructor = Array.isArray(rawCourse.instructors)
    ? rawCourse.instructors[0]
    : rawCourse.instructors

  if (!instructor) return null

  if (rawCourse.category !== "baile" && rawCourse.category !== "tatuaje") {
    return null
  }

  const course = { ...rawCourse }
  delete (course as { instructors?: unknown }).instructors
  const decoratedCourse = decorateCourseWithPricing({
    ...course,
    category: rawCourse.category,
    is_free: rawCourse.is_free,
    course_discount_enabled: rawCourse.course_discount_enabled,
    course_discount_type:
      rawCourse.course_discount_type === "percentage" ||
      rawCourse.course_discount_type === "fixed"
        ? rawCourse.course_discount_type
        : null,
    course_discount_value: rawCourse.course_discount_value,
  })

  return {
    id: item.id,
    user_id: item.user_id,
    course_id: item.course_id,
    added_at: item.added_at,
    course: {
      ...course,
      category: rawCourse.category,
      instructor,
      list_price: decoratedCourse.list_price,
      current_price: decoratedCourse.current_price,
      has_course_discount: decoratedCourse.has_course_discount,
      course_discount_amount: decoratedCourse.course_discount_amount,
      course_discount_label: decoratedCourse.course_discount_label,
    },
  }
}

function buildCartDiscountName(lines: PricingLine[]): string | null {
  const comboNames = [...new Set(
    lines
      .filter((line) => line.kind === "combo")
      .map((line) => line.source_name)
  )]

  if (comboNames.length === 1) return comboNames[0] ?? null
  if (comboNames.length > 1) return "Promociones multiples"
  return null
}

function getComboRuleIds(lines: PricingLine[]): string[] {
  return [...new Set(
    lines
      .filter((line) => line.kind === "combo" && line.source_id)
      .map((line) => line.source_id as string)
  )]
}

export async function addCourseToCartForUser(input: {
  supabase: RlsClient
  userId: string
  courseId: string
}): Promise<AddCourseToCartResult> {
  const { data: course, error: courseError } = await input.supabase
    .from("courses")
    .select(
      "id, slug, category, price, is_free, is_published, course_discount_enabled, course_discount_type, course_discount_value"
    )
    .eq("id", input.courseId)
    .maybeSingle()

  if (courseError || !course || !course.is_published) {
    return {
      success: false,
      code: "COURSE_UNAVAILABLE",
      courseSlug: course?.slug ?? null,
    }
  }

  const decoratedCourse = decorateCourseWithPricing({
    ...course,
    title: course.slug,
    category: course.category === "tatuaje" ? "tatuaje" : "baile",
  })

  if (course.is_free || decoratedCourse.current_price <= 0) {
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
    .order("added_at", { ascending: true })

  if (error || !data) return []

  const baseItems: Array<ReturnType<typeof mapCartItem>> = []
  const invalidItemIds: string[] = []

  for (const item of data) {
    const mappedItem = mapCartItem(item)
    if (!mappedItem) {
      invalidItemIds.push(item.id)
      continue
    }

    if (
      !mappedItem.course.is_published ||
      mappedItem.course.is_free ||
      mappedItem.course.current_price <= 0
    ) {
      invalidItemIds.push(item.id)
      continue
    }

    baseItems.push(mappedItem)
  }

  if (invalidItemIds.length > 0) {
    await input.supabase.from("cart_items").delete().in("id", invalidItemIds)
  }

  const validItems = baseItems.filter((item): item is NonNullable<typeof item> => Boolean(item))
  if (validItems.length === 0) return []

  const pricing = calculatePricing(
    validItems.map((item) => ({
      id: item.course.id,
      title: item.course.title,
      category: item.course.category,
      price: item.course.price,
      is_free: item.course.is_free,
      added_at: item.added_at,
      course_discount_enabled: item.course.course_discount_enabled,
      course_discount_type:
        item.course.course_discount_type === "percentage" ||
        item.course.course_discount_type === "fixed"
          ? item.course.course_discount_type
          : null,
      course_discount_value: item.course.course_discount_value,
    })),
    []
  )

  const pricedByCourseId = new Map(pricing.items.map((item) => [item.courseId, item]))

  return validItems.map((item) => {
    const pricedItem = pricedByCourseId.get(item.course.id)
    return {
      ...item,
      listPrice: pricedItem?.listPrice ?? item.course.price,
      courseDiscountAmount: pricedItem?.courseDiscountAmount ?? 0,
      priceAfterCourseDiscount: pricedItem?.priceAfterCourseDiscount ?? item.course.current_price,
      comboDiscountAmount: 0,
      finalPrice: pricedItem?.finalPrice ?? item.course.current_price,
      coursePromotionLabel: pricedItem?.coursePromotionLabel ?? item.course.course_discount_label,
      comboPromotionLabel: null,
    }
  })
}

export async function resolveCartStateForUser(input: {
  supabase: RlsClient
  userId: string
}): Promise<ResolvedCartState> {
  const items = await getCartItemsForUser(input)

  const { data: rules } = await input.supabase
    .from("discount_rules")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true })

  const pricing = calculatePricing(
    items.map((item) => ({
      id: item.course.id,
      title: item.course.title,
      category: item.course.category,
      price: item.course.price,
      is_free: item.course.is_free,
      added_at: item.added_at,
      course_discount_enabled: item.course.course_discount_enabled,
      course_discount_type:
        item.course.course_discount_type === "percentage" ||
        item.course.course_discount_type === "fixed"
          ? item.course.course_discount_type
          : null,
      course_discount_value: item.course.course_discount_value,
    })),
    (rules ?? []) as DiscountRule[]
  )

  const pricedByCourseId = new Map(pricing.items.map((item) => [item.courseId, item]))
  const resolvedItems = items.map((item) => {
    const pricedItem = pricedByCourseId.get(item.course.id)
    if (!pricedItem) return item

    return {
      ...item,
      listPrice: pricedItem.listPrice,
      courseDiscountAmount: pricedItem.courseDiscountAmount,
      priceAfterCourseDiscount: pricedItem.priceAfterCourseDiscount,
      comboDiscountAmount: pricedItem.comboDiscountAmount,
      finalPrice: pricedItem.finalPrice,
      coursePromotionLabel: pricedItem.coursePromotionLabel,
      comboPromotionLabel: pricedItem.comboPromotionLabel,
    }
  })

  return {
    items: resolvedItems,
    listSubtotal: pricing.listSubtotal,
    subtotal: pricing.subtotal,
    courseDiscountAmount: pricing.courseDiscountTotal,
    comboDiscountAmount: pricing.comboDiscountTotal,
    discountAmount: pricing.discountTotal,
    appliedDiscountLines: pricing.appliedDiscountLines,
    primaryComboRuleIds: getComboRuleIds(pricing.appliedDiscountLines),
    primaryComboRuleName: buildCartDiscountName(pricing.appliedDiscountLines),
    total: pricing.total,
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
