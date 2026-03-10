"use server"

import { revalidatePath } from "next/cache"

import { enqueuePurchaseConfirmation } from "@/actions/email"
import { applyApprovedOrderEffects } from "@/lib/order-approval"
import { decorateCourseWithPricing } from "@/lib/pricing"
import { getCurrentUser } from "@/lib/supabase/auth"
import { syncCourseProgressSnapshot } from "@/lib/course-progress"
import { createServerClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { generateReference } from "@/lib/utils"

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
    .select(
      "id, title, category, price, is_free, is_published, slug, course_discount_enabled, course_discount_type, course_discount_value"
    )
    .eq("id", courseId)
    .single()

  if (!course) return { error: "Curso no encontrado." }
  if (!course.is_published) return { error: "Este curso no esta disponible." }

  const decoratedCourse = decorateCourseWithPricing({
    ...course,
    category: course.category === "tatuaje" ? "tatuaje" : "baile",
  })
  const isEffectivelyFree = course.is_free || decoratedCourse.current_price === 0

  if (!isEffectivelyFree) return { error: "Este curso no es gratuito." }

  // Check existing enrollment (idempotency)
  const { data: existing } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle()

  const adminClient = createServiceRoleClient()

  if (existing) {
    await syncCourseProgressSnapshot({
      supabase: adminClient,
      userId: user.id,
      courseId,
      courseSlug: course.slug,
    })
    revalidatePath(`/cursos/${course.slug}`)
    revalidatePath("/dashboard")
    revalidatePath(`/dashboard/cursos/${course.slug}`)
    return { success: true }
  }

  if (!course.is_free) {
    const now = new Date().toISOString()
    const orderReference = generateReference("SZFREE")
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

    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .insert({
        user_id: user.id,
        customer_name_snapshot: user.full_name,
        customer_email_snapshot: user.email,
        customer_phone_snapshot: user.phone ?? null,
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
      })
      .select("id")
      .single()

    if (orderError || !order) {
      return { error: "No se pudo completar la inscripcion promocional." }
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
      return { error: "No se pudo completar la inscripcion promocional." }
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
      return { error: "No se pudo completar la inscripcion promocional." }
    }

    await applyApprovedOrderEffects({
      supabase: adminClient,
      orderId: order.id,
      userId: user.id,
    })

    try {
      await enqueuePurchaseConfirmation(order.id)
    } catch (error) {
      console.error("[enrollFree] failed to enqueue promo email", error)
    }

    revalidatePath(`/cursos/${course.slug}`)
    revalidatePath("/dashboard")
    revalidatePath(`/dashboard/cursos/${course.slug}`)
    return { success: true }
  }

  // Use service role for insert (RLS doesn't have INSERT for users on enrollments)
  const { error: enrollError } = await adminClient.from("enrollments").insert({
    user_id: user.id,
    course_id: courseId,
    source: "free",
  })

  if (enrollError) {
    return { error: "No se pudo completar la inscripcion." }
  }

  await syncCourseProgressSnapshot({
    supabase: adminClient,
    userId: user.id,
    courseId,
    courseSlug: course.slug,
    touchLastAccess: true,
  })

  revalidatePath(`/cursos/${course.slug}`)
  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/cursos/${course.slug}`)
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
    course: decorateCourseWithPricing(
      (Array.isArray(e.courses) ? e.courses[0] : e.courses) as Course
    ),
  })) as (Enrollment & { course: Course })[]
}
