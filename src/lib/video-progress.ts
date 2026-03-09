import { revalidatePath } from "next/cache"

import type { SupabaseClient } from "@supabase/supabase-js"

import { createServiceRoleClient } from "@/lib/supabase/admin"

import type { Database } from "@/types/database"

type RlsClient = SupabaseClient<Database>

interface ResolveLessonAccessInput {
  supabase: RlsClient
  userId: string
  lessonId: string
  expectedCourseId?: string
}

interface ResolveLessonAccessResult {
  ok: true
  courseId: string
  courseSlug: string | null
}

function getRelatedCourseSlug(
  value: { slug: string } | { slug: string }[] | null | undefined
) {
  if (!value) return null
  if (Array.isArray(value)) {
    return value[0]?.slug ?? null
  }
  return value.slug
}

async function assertMutationSucceeded<T extends { error: Error | null }>(
  operation: PromiseLike<T>
) {
  const { error } = await operation

  if (error) {
    throw error
  }
}

export async function resolveEnrolledLessonAccess({
  supabase,
  userId,
  lessonId,
  expectedCourseId,
}: ResolveLessonAccessInput): Promise<
  | ResolveLessonAccessResult
  | { ok: false; reason: "lesson_not_found" | "course_mismatch" | "not_enrolled" }
> {
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, course_id, courses(slug)")
    .eq("id", lessonId)
    .single()

  if (!lesson) {
    return { ok: false, reason: "lesson_not_found" }
  }

  if (expectedCourseId && lesson.course_id !== expectedCourseId) {
    return { ok: false, reason: "course_mismatch" }
  }

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", userId)
    .eq("course_id", lesson.course_id)
    .maybeSingle()

  if (!enrollment) {
    return { ok: false, reason: "not_enrolled" }
  }

  return {
    ok: true,
    courseId: lesson.course_id,
    courseSlug: getRelatedCourseSlug(
      lesson.courses as { slug: string } | { slug: string }[] | null | undefined
    ),
  }
}

export async function persistLessonVideoPosition(input: {
  userId: string
  lessonId: string
  position: number
}) {
  const adminClient = createServiceRoleClient()

  await assertMutationSucceeded(
    adminClient.from("lesson_progress").upsert(
      {
        user_id: input.userId,
        lesson_id: input.lessonId,
        video_position: Math.floor(input.position),
      },
      { onConflict: "user_id,lesson_id" }
    )
  )
}

export async function persistCourseLastAccess(input: {
  userId: string
  courseId: string
  lessonId: string
}) {
  const adminClient = createServiceRoleClient()

  await assertMutationSucceeded(
    adminClient.from("course_progress").upsert(
      {
        user_id: input.userId,
        course_id: input.courseId,
        last_lesson_id: input.lessonId,
        last_accessed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,course_id" }
    )
  )
}

export async function persistExitVideoProgress(input: {
  userId: string
  courseId: string
  lessonId: string
  position: number
}) {
  const adminClient = createServiceRoleClient()
  const videoPosition = Math.floor(input.position)
  const accessedAt = new Date().toISOString()

  await assertMutationSucceeded(
    adminClient.from("lesson_progress").upsert(
      {
        user_id: input.userId,
        lesson_id: input.lessonId,
        video_position: videoPosition,
      },
      { onConflict: "user_id,lesson_id" }
    )
  )

  await assertMutationSucceeded(
    adminClient.from("course_progress").upsert(
      {
        user_id: input.userId,
        course_id: input.courseId,
        last_lesson_id: input.lessonId,
        last_accessed_at: accessedAt,
      },
      { onConflict: "user_id,course_id" }
    )
  )
}

export function revalidateVideoProgressPaths(courseSlug: string | null) {
  revalidatePath("/dashboard")

  if (courseSlug) {
    revalidatePath(`/dashboard/cursos/${courseSlug}`)
  }
}
