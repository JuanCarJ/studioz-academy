import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"

import { createCheckoutOrder } from "@/lib/checkout-order"
import { paymentRpc } from "@/lib/payment-rpc"
import { decorateCourseWithPricing } from "@/lib/pricing"
import { syncCourseProgressSnapshot } from "@/lib/course-progress"
import { createServiceRoleClient } from "@/lib/supabase/admin"

import type { Database } from "@/types/database"

type RlsClient = SupabaseClient<Database>

export type EnrollFreeCourseErrorCode =
  | "ALREADY_ENROLLED"
  | "COURSE_NOT_FOUND"
  | "COURSE_UNAVAILABLE"
  | "COURSE_NOT_FREE"
  | "ENROLL_FAILED"

export interface EnrollFreeCourseResult {
  success: boolean
  code?: EnrollFreeCourseErrorCode
  courseSlug: string | null
}

export async function enrollFreeCourseForUser(input: {
  supabase: RlsClient
  userId: string
  courseId: string
}): Promise<EnrollFreeCourseResult>
export async function enrollFreeCourseForUser(input: {
  supabase: RlsClient
  userId: string
  courseId: string
}): Promise<EnrollFreeCourseResult> {
  const { data: course } = await input.supabase
    .from("courses")
    .select(
      "id, title, category, price, is_free, is_published, slug, course_discount_enabled, course_discount_type, course_discount_value"
    )
    .eq("id", input.courseId)
    .single()

  if (!course) {
    return { success: false, code: "COURSE_NOT_FOUND", courseSlug: null }
  }

  if (!course.is_published) {
    return {
      success: false,
      code: "COURSE_UNAVAILABLE",
      courseSlug: course.slug,
    }
  }

  const decoratedCourse = decorateCourseWithPricing({
    ...course,
    category: course.category === "tatuaje" ? "tatuaje" : "baile",
  })
  const isEffectivelyFree = course.is_free || decoratedCourse.current_price === 0

  if (!isEffectivelyFree) {
    return {
      success: false,
      code: "COURSE_NOT_FREE",
      courseSlug: course.slug,
    }
  }

  const { data: existing } = await input.supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", input.userId)
    .eq("course_id", input.courseId)
    .maybeSingle()

  const adminClient = createServiceRoleClient()

  if (existing) {
    await syncCourseProgressSnapshot({
      supabase: adminClient,
      userId: input.userId,
      courseId: input.courseId,
      courseSlug: course.slug,
    })
    revalidatePath(`/cursos/${course.slug}`)
    revalidatePath("/dashboard")
    revalidatePath(`/dashboard/cursos/${course.slug}`)
    return { success: true, code: "ALREADY_ENROLLED", courseSlug: course.slug }
  }

  if (!course.is_free) {
    const {
      data: { user },
    } = await input.supabase.auth.getUser()
    if (!user || user.id !== input.userId) return { success: false, code: "ENROLL_FAILED", courseSlug: course.slug }
    const pricingSnapshot = {
      listSubtotal: decoratedCourse.list_price,
      subtotal: decoratedCourse.list_price,
      courseDiscountTotal: decoratedCourse.course_discount_amount,
      comboDiscountTotal: 0,
      discountTotal: decoratedCourse.course_discount_amount,
      total: 0,
      appliedDiscountLines: [
        {
          scope: "course",
          kind: "course_discount",
          source_id: course.id,
          source_name: course.title,
          course_id: course.id,
          course_title: course.title,
          amount: decoratedCourse.course_discount_amount,
          metadata: {
            label: decoratedCourse.course_discount_label,
          },
        },
      ],
      items: [
        {
          courseId: course.id,
          courseTitle: course.title,
          listPrice: decoratedCourse.list_price,
          courseDiscountAmount: decoratedCourse.course_discount_amount,
          priceAfterCourseDiscount: 0,
          comboDiscountAmount: 0,
          finalPrice: 0,
          coursePromotionLabel: decoratedCourse.course_discount_label,
          comboPromotionLabel: null,
        },
      ],
    }
    try {
      await createCheckoutOrder({
        userId: input.userId,
        customerName: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "",
        customerEmail: user.email ?? "",
        items: pricingSnapshot.items,
        discountRuleName: "Promoción del curso",
        pricingSnapshot,
        discountLines: pricingSnapshot.appliedDiscountLines,
      })
    } catch {
      return { success: false, code: "ENROLL_FAILED", courseSlug: course.slug }
    }

    revalidatePath(`/cursos/${course.slug}`)
    revalidatePath("/dashboard")
    revalidatePath(`/dashboard/cursos/${course.slug}`)
    return { success: true, courseSlug: course.slug }
  }

  try {
    const enrolled = await paymentRpc<boolean>(adminClient, "enroll_native_free_course", { p_user_id: input.userId, p_course_id: input.courseId })
    if (!enrolled) return { success: false, code: "ENROLL_FAILED", courseSlug: course.slug }
  } catch {
    return {
      success: false,
      code: "ENROLL_FAILED",
      courseSlug: course.slug,
    }
  }

  revalidatePath(`/cursos/${course.slug}`)
  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/cursos/${course.slug}`)
  return { success: true, courseSlug: course.slug }
}

export function resolvePostEnrollFreeRedirect(input: {
  result: EnrollFreeCourseResult
  redirectTo: string | null
  fallbackPath: string
}): string {
  const sanitizedRedirect = input.redirectTo ?? input.fallbackPath

  if (
    (input.result.success || input.result.code === "ALREADY_ENROLLED") &&
    input.result.courseSlug
  ) {
    return `/dashboard/cursos/${input.result.courseSlug}`
  }

  if (
    input.result.code === "COURSE_NOT_FREE" ||
    input.result.code === "COURSE_UNAVAILABLE" ||
    input.result.code === "COURSE_NOT_FOUND" ||
    input.result.code === "ENROLL_FAILED"
  ) {
    return sanitizedRedirect
  }

  return sanitizedRedirect
}
