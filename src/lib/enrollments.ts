import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"

import { enqueuePurchaseConfirmation } from "@/actions/email"
import { applyApprovedOrderEffects } from "@/lib/order-approval"
import { decorateCourseWithPricing } from "@/lib/pricing"
import { syncCourseProgressSnapshot } from "@/lib/course-progress"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { generateReference } from "@/lib/utils"

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
    const now = new Date().toISOString()
    const orderReference = generateReference("SZFREE")
    const {
      data: { user },
    } = await input.supabase.auth.getUser()
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
    const orderInsert: Database["public"]["Tables"]["orders"]["Insert"] = {
      user_id: input.userId,
      customer_name_snapshot:
        typeof user?.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : "",
      customer_email_snapshot: user?.email ?? "",
      customer_phone_snapshot:
        typeof user?.user_metadata?.phone === "string"
          ? user.user_metadata.phone
          : null,
      reference: orderReference,
      list_subtotal: decoratedCourse.list_price,
      subtotal: decoratedCourse.list_price,
      course_discount_amount: decoratedCourse.course_discount_amount,
      combo_discount_amount: 0,
      discount_amount: decoratedCourse.course_discount_amount,
      total: 0,
      discount_rule_name_snapshot: "Promocion del curso",
      pricing_snapshot_json: pricingSnapshot,
      status: "approved",
      currency: "COP",
      payment_method: "promo",
      approved_at: now,
    }

    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .insert(orderInsert)
      .select("id")
      .single()

    if (orderError || !order) {
      return {
        success: false,
        code: "ENROLL_FAILED",
        courseSlug: course.slug,
      }
    }

    const { error: orderItemError } = await adminClient.from("order_items").insert({
      order_id: order.id,
      course_id: course.id,
      course_title_snapshot: course.title,
      price_at_purchase: decoratedCourse.list_price,
      list_price_snapshot: decoratedCourse.list_price,
      course_discount_amount_snapshot: decoratedCourse.course_discount_amount,
      price_after_course_discount_snapshot: 0,
      combo_discount_amount_snapshot: 0,
      final_price_snapshot: 0,
    })

    if (orderItemError) {
      return {
        success: false,
        code: "ENROLL_FAILED",
        courseSlug: course.slug,
      }
    }

    const { error: lineError } = await adminClient
      .from("order_discount_lines")
      .insert({
        order_id: order.id,
        scope: "course",
        kind: "course_discount",
        source_id: course.id,
        source_name_snapshot: course.title,
        course_id: course.id,
        course_title_snapshot: course.title,
        amount: decoratedCourse.course_discount_amount,
        metadata_json: {
          label: decoratedCourse.course_discount_label,
        },
      })

    if (lineError) {
      return {
        success: false,
        code: "ENROLL_FAILED",
        courseSlug: course.slug,
      }
    }

    await applyApprovedOrderEffects({
      supabase: adminClient,
      orderId: order.id,
      userId: input.userId,
    })

    try {
      await enqueuePurchaseConfirmation(order.id)
    } catch (error) {
      console.error("[enrollFreeCourseForUser] failed to enqueue promo email", error)
    }

    revalidatePath(`/cursos/${course.slug}`)
    revalidatePath("/dashboard")
    revalidatePath(`/dashboard/cursos/${course.slug}`)
    return { success: true, courseSlug: course.slug }
  }

  const { error: enrollError } = await adminClient.from("enrollments").insert({
    user_id: input.userId,
    course_id: input.courseId,
    source: "free",
  })

  if (enrollError) {
    return {
      success: false,
      code: "ENROLL_FAILED",
      courseSlug: course.slug,
    }
  }

  await syncCourseProgressSnapshot({
    supabase: adminClient,
    userId: input.userId,
    courseId: input.courseId,
    courseSlug: course.slug,
    touchLastAccess: true,
  })

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
