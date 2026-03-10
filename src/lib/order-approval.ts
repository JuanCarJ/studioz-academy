import type { SupabaseClient } from "@supabase/supabase-js"

import { syncCourseProgressSnapshot } from "@/lib/course-progress"
import { tryRevalidateVideoProgressPaths } from "@/lib/video-progress"

import type { Database } from "@/types/database"

type AdminClient = SupabaseClient<Database>

export async function applyApprovedOrderEffects(input: {
  supabase: AdminClient
  orderId: string
  userId: string
}) {
  const { data: orderItems, error: orderItemsError } = await input.supabase
    .from("order_items")
    .select("course_id, courses(slug)")
    .eq("order_id", input.orderId)

  if (orderItemsError) {
    throw orderItemsError
  }

  const courseEntries = new Map<string, string | null>()
  for (const item of orderItems ?? []) {
    if (!item.course_id) continue

    const course = Array.isArray(item.courses) ? item.courses[0] : item.courses
    courseEntries.set(item.course_id, course?.slug ?? null)
  }

  const enrollments = Array.from(courseEntries.keys()).map((courseId) => ({
    user_id: input.userId,
    course_id: courseId,
    source: "purchase" as const,
    order_id: input.orderId,
  }))

  if (enrollments.length > 0) {
    await input.supabase.from("enrollments").upsert(enrollments, {
      onConflict: "user_id,course_id",
      ignoreDuplicates: true,
    })

    for (const [courseId, courseSlug] of courseEntries) {
      await syncCourseProgressSnapshot({
        supabase: input.supabase,
        userId: input.userId,
        courseId,
        courseSlug,
        touchLastAccess: true,
      })
      tryRevalidateVideoProgressPaths(courseSlug)
    }

    await input.supabase
      .from("cart_items")
      .delete()
      .eq("user_id", input.userId)
      .in("course_id", Array.from(courseEntries.keys()))
  }
}
