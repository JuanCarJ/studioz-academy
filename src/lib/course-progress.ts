import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

type DbClient = SupabaseClient<Database>
type CourseProgressRow = Database["public"]["Tables"]["course_progress"]["Row"]

interface CourseProgressAggregate {
  completedLessons: number
  totalLessons: number
  isCompleted: boolean
}

interface SyncCourseProgressSnapshotInput {
  supabase: DbClient
  userId: string
  courseId: string
  courseSlug?: string | null
  lessonIds?: string[]
  lastLessonId?: string | null
  lastAccessedAt?: string
  touchLastAccess?: boolean
}

interface SyncCourseProgressSnapshotResult {
  courseSlug: string | null
  lessonIds: string[]
  progress: CourseProgressRow
  aggregate: CourseProgressAggregate
}

interface EffectiveCourseProgressInput {
  totalLessons: number
  actualCompletedLessons: number
  persistedProgress:
    | Pick<CourseProgressRow, "completed_lessons" | "is_completed">
    | null
    | undefined
}

function deriveCourseCompletionState(completedLessons: number, totalLessons: number) {
  const normalizedCompletedLessons = Math.max(
    0,
    Math.min(completedLessons, totalLessons)
  )

  return {
    completedLessons: normalizedCompletedLessons,
    totalLessons,
    isCompleted:
      totalLessons > 0 && normalizedCompletedLessons === totalLessons,
  }
}

async function fetchCourseContext(
  supabase: DbClient,
  courseId: string
): Promise<{ courseSlug: string | null; lessonIds: string[] }> {
  const [{ data: course, error: courseError }, { data: lessons, error: lessonsError }] =
    await Promise.all([
      supabase.from("courses").select("slug").eq("id", courseId).maybeSingle(),
      supabase.from("lessons").select("id").eq("course_id", courseId),
    ])

  if (courseError) {
    throw courseError
  }

  if (lessonsError) {
    throw lessonsError
  }

  return {
    courseSlug: course?.slug ?? null,
    lessonIds: (lessons ?? []).map((lesson) => lesson.id),
  }
}

async function fetchCompletedLessonsCount(
  supabase: DbClient,
  userId: string,
  lessonIds: string[]
) {
  if (lessonIds.length === 0) {
    return 0
  }

  const { count, error } = await supabase
    .from("lesson_progress")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("completed", true)
    .in("lesson_id", lessonIds)

  if (error) {
    throw error
  }

  return count ?? 0
}

function resolveLastLessonId(input: {
  lessonIds: string[]
  existingLastLessonId: string | null
  nextLastLessonId: string | null | undefined
}) {
  const validLessonIds = new Set(input.lessonIds)

  if (input.nextLastLessonId !== undefined) {
    return input.nextLastLessonId && validLessonIds.has(input.nextLastLessonId)
      ? input.nextLastLessonId
      : null
  }

  return input.existingLastLessonId && validLessonIds.has(input.existingLastLessonId)
    ? input.existingLastLessonId
    : null
}

export async function syncCourseProgressSnapshot(
  input: SyncCourseProgressSnapshotInput
): Promise<SyncCourseProgressSnapshotResult> {
  const existingProgressPromise = input.supabase
    .from("course_progress")
    .select("*")
    .eq("user_id", input.userId)
    .eq("course_id", input.courseId)
    .maybeSingle()

  const contextPromise =
    input.lessonIds && input.courseSlug !== undefined
      ? Promise.resolve({
          lessonIds: input.lessonIds,
          courseSlug: input.courseSlug,
        })
      : fetchCourseContext(input.supabase, input.courseId).then((context) => ({
          lessonIds: input.lessonIds ?? context.lessonIds,
          courseSlug:
            input.courseSlug !== undefined
              ? input.courseSlug
              : context.courseSlug,
        }))

  const [{ data: existingProgress, error: existingProgressError }, context] =
    await Promise.all([existingProgressPromise, contextPromise])

  if (existingProgressError) {
    throw existingProgressError
  }

  const completedLessons = await fetchCompletedLessonsCount(
    input.supabase,
    input.userId,
    context.lessonIds
  )
  const aggregate = deriveCourseCompletionState(
    completedLessons,
    context.lessonIds.length
  )
  const now = new Date().toISOString()
  const lastLessonId = resolveLastLessonId({
    lessonIds: context.lessonIds,
    existingLastLessonId: existingProgress?.last_lesson_id ?? null,
    nextLastLessonId: input.lastLessonId,
  })
  const lastAccessedAt =
    input.lastAccessedAt ??
    (input.touchLastAccess
      ? now
      : existingProgress?.last_accessed_at ?? now)

  const { data: progress, error: upsertError } = await input.supabase
    .from("course_progress")
    .upsert(
      {
        user_id: input.userId,
        course_id: input.courseId,
        last_lesson_id: lastLessonId,
        completed_lessons: aggregate.completedLessons,
        is_completed: aggregate.isCompleted,
        last_accessed_at: lastAccessedAt,
      },
      { onConflict: "user_id,course_id" }
    )
    .select("*")
    .single()

  if (upsertError) {
    throw upsertError
  }

  return {
    courseSlug: context.courseSlug,
    lessonIds: context.lessonIds,
    progress,
    aggregate,
  }
}

export async function syncCourseProgressForEnrolledUsers(input: {
  supabase: DbClient
  courseId: string
  courseSlug?: string | null
}) {
  const context =
    input.courseSlug !== undefined
      ? {
          lessonIds: (await fetchCourseContext(input.supabase, input.courseId)).lessonIds,
          courseSlug: input.courseSlug,
        }
      : await fetchCourseContext(input.supabase, input.courseId)

  const { data: enrollments, error: enrollmentsError } = await input.supabase
    .from("enrollments")
    .select("user_id")
    .eq("course_id", input.courseId)

  if (enrollmentsError) {
    throw enrollmentsError
  }

  for (const enrollment of enrollments ?? []) {
    await syncCourseProgressSnapshot({
      supabase: input.supabase,
      userId: enrollment.user_id,
      courseId: input.courseId,
      courseSlug: context.courseSlug,
      lessonIds: context.lessonIds,
    })
  }

  return {
    courseSlug: context.courseSlug,
    lessonIds: context.lessonIds,
    updatedUsers: enrollments?.length ?? 0,
  }
}

export function resolveEffectiveCourseProgress(
  input: EffectiveCourseProgressInput
) {
  const aggregate = deriveCourseCompletionState(
    input.actualCompletedLessons,
    input.totalLessons
  )
  const persistedCompletedLessons = input.persistedProgress?.completed_lessons ?? 0
  const persistedIsCompleted = input.persistedProgress?.is_completed ?? false
  const shouldUseFallback =
    !input.persistedProgress ||
    persistedCompletedLessons > input.totalLessons ||
    persistedCompletedLessons !== aggregate.completedLessons ||
    persistedIsCompleted !== aggregate.isCompleted
  const completedLessons = shouldUseFallback
    ? aggregate.completedLessons
    : persistedCompletedLessons
  const isCompleted = shouldUseFallback
    ? aggregate.isCompleted
    : persistedIsCompleted

  return {
    completedLessons,
    totalLessons: input.totalLessons,
    percentage:
      input.totalLessons > 0
        ? Math.round((completedLessons / input.totalLessons) * 100)
        : 0,
    isCompleted,
    usedFallback: shouldUseFallback,
  }
}
