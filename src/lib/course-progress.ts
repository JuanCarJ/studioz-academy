import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

type DbClient = SupabaseClient<Database>
type CourseProgressRow = Database["public"]["Tables"]["course_progress"]["Row"]

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
  aggregate: { completedLessons: number; totalLessons: number; isCompleted: boolean }
}

/** One transaction and aggregate for this enrolled user; never fetch every learner. */
export async function syncCourseProgressSnapshot(
  input: SyncCourseProgressSnapshotInput
): Promise<SyncCourseProgressSnapshotResult> {
  const { data, error } = await input.supabase.rpc("sync_student_course_progress", {
    p_user_id: input.userId,
    p_course_id: input.courseId,
    p_last_lesson_id: input.lastLessonId ?? null,
    p_set_last_lesson: input.lastLessonId !== undefined,
    p_touch_last_access: input.touchLastAccess ?? false,
    p_last_accessed_at: input.lastAccessedAt ?? null,
  })
  if (error) throw error
  if (!data) throw new Error("Missing course progress result")
  return data as unknown as SyncCourseProgressSnapshotResult
}

/**
 * Kept for admin callers. Lesson totals are derived at read time, so editing a
 * curriculum invalidates pages but must not fan out writes across enrollments.
 */
export async function syncCourseProgressForEnrolledUsers(input: {
  supabase: DbClient
  courseId: string
  courseSlug?: string | null
}) {
  if (input.courseSlug !== undefined) {
    return { courseSlug: input.courseSlug, lessonIds: [], updatedUsers: 0 }
  }
  const { data, error } = await input.supabase
    .from("courses").select("slug").eq("id", input.courseId).maybeSingle()
  if (error) throw error
  return { courseSlug: data?.slug ?? null, lessonIds: [], updatedUsers: 0 }
}

export function resolveEffectiveCourseProgress(input: {
  totalLessons: number
  actualCompletedLessons: number
  persistedProgress: Pick<CourseProgressRow, "completed_lessons" | "is_completed"> | null | undefined
}) {
  const totalLessons = Math.max(0, input.totalLessons)
  const completedLessons = Math.max(0, Math.min(input.actualCompletedLessons, totalLessons))
  const isCompleted = totalLessons > 0 && completedLessons === totalLessons
  return {
    completedLessons,
    totalLessons,
    percentage: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
    isCompleted,
    usedFallback: !input.persistedProgress ||
      input.persistedProgress.completed_lessons !== completedLessons ||
      input.persistedProgress.is_completed !== isCompleted,
  }
}
