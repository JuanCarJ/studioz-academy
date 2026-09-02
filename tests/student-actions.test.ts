import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

const mock = vi.hoisted(() => ({
  user: vi.fn(), client: vi.fn(), rpc: vi.fn(), from: vi.fn(), select: vi.fn(),
  eq: vi.fn(), order: vi.fn(), range: vi.fn(), maybeSingle: vi.fn(),
  access: vi.fn(), persist: vi.fn(), revalidate: vi.fn(),
}))
vi.mock("@/lib/supabase/auth", () => ({ getCurrentUser: mock.user }))
vi.mock("@/lib/supabase/server", () => ({ createServerClient: mock.client }))
vi.mock("@/lib/video-progress", () => ({
  persistCourseLastAccess: mock.persist, revalidateVideoProgressPaths: mock.revalidate,
  resolveEnrolledLessonAccess: mock.access,
}))

import { getEnrolledCoursesWithProgress, resetCourseProgress, updateLastLesson } from "@/actions/progress"
import { getUserOrders } from "@/actions/purchases"
import { resolveEffectiveCourseProgress, syncCourseProgressForEnrolledUsers, syncCourseProgressSnapshot } from "@/lib/course-progress"

beforeEach(() => {
  mock.user.mockResolvedValue({ id: "student" })
  const chain = { select: mock.select, eq: mock.eq, order: mock.order, range: mock.range, maybeSingle: mock.maybeSingle }
  mock.from.mockReturnValue(chain)
  mock.select.mockReturnValue(chain)
  mock.eq.mockReturnValue(chain)
  mock.order.mockReturnValue(chain)
  mock.range.mockResolvedValue({ data: [], error: null, count: 0 })
  mock.maybeSingle.mockResolvedValue({ data: { slug: "baile" }, error: null })
  mock.client.mockResolvedValue({ from: mock.from, rpc: mock.rpc })
  mock.rpc.mockResolvedValue({ data: { courses: [], total: 0, totalCourses: 0, completedCourses: 0, page: 1, pageSize: 12 }, error: null })
  mock.access.mockResolvedValue({ ok: true, courseId: "course", courseSlug: "baile" })
  mock.persist.mockResolvedValue(undefined)
})

describe("bounded student reads", () => {
  it("does not access data for unauthenticated students", async () => {
    mock.user.mockResolvedValue(null)
    expect(await getEnrolledCoursesWithProgress()).toHaveProperty("error", "AUTH_REQUIRED")
    expect(await getUserOrders()).toHaveProperty("error", "AUTH_REQUIRED")
    expect(mock.client).not.toHaveBeenCalled()
  })
  it("gets aggregate progress with a single authenticated RPC and bounds hostile inputs", async () => {
    await getEnrolledCoursesWithProgress({ page: -4, pageSize: 1000, filter: "other-user", sort: "SQL" })
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("get_student_courses", { p_filter: "all", p_sort: "lastAccessed", p_page: 1, p_page_size: 48 })
    expect(mock.from).not.toHaveBeenCalled()
  })
  it("filters and sorts before pagination", async () => {
    await getEnrolledCoursesWithProgress({ page: 3, pageSize: 12, filter: "completed", sort: "progressAsc" })
    expect(mock.rpc).toHaveBeenCalledWith("get_student_courses", { p_filter: "completed", p_sort: "progressAsc", p_page: 3, p_page_size: 12 })
  })
  it("does not disguise a failed aggregate read as empty successful learning", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "42501" } })
    expect(await getEnrolledCoursesWithProgress()).toHaveProperty("error")
  })
  it("bounds purchases, requests a truthful total, and orders ties deterministically", async () => {
    mock.range.mockResolvedValue({ data: [], error: null, count: 50 })
    expect(await getUserOrders({ page: 2, pageSize: 12 })).toMatchObject({ total: 50, page: 2, pageSize: 12 })
    expect(mock.eq).toHaveBeenCalledWith("user_id", "student")
    expect(mock.select).toHaveBeenCalledWith(expect.any(String), { count: "exact" })
    expect(mock.order).toHaveBeenCalledWith("id", { ascending: false })
    expect(mock.range).toHaveBeenCalledWith(12, 23)
  })
  it("applies the same bounds to legacy snapshot fallback", async () => {
    mock.range.mockResolvedValueOnce({ data: null, error: { code: "42703", message: "discount_rule_name_snapshot missing" }, count: null })
      .mockResolvedValueOnce({ data: [], error: null, count: 8 })
    expect(await getUserOrders({ page: 2, pageSize: 3 })).toMatchObject({ total: 8 })
    expect(mock.range.mock.calls).toEqual([[3, 5], [3, 5]])
  })
  it("preserves historical item pricing rather than recomputing from the catalog", async () => {
    mock.range.mockResolvedValue({ data: [{
      id: "order", reference: "REF", status: "approved", subtotal: 100, list_subtotal: 100,
      discount_amount: 100, discount_rule_name_snapshot: "Promo original", discount_rules: { name: "Regla cambiada" },
      total: 0, payment_method: "PROMO", created_at: "2026-09-01", approved_at: "2026-09-01",
      items: [{ course_title_snapshot: "Curso original", final_price_snapshot: 0 }], discount_lines: [],
    }], error: null, count: 1 })
    const result = await getUserOrders()
    expect(result.orders[0]).toMatchObject({ total: 0, payment_method: "PROMO", discount_rule_name: "Promo original", items: [{ course_title_snapshot: "Curso original", final_price_snapshot: 0 }] })
  })
})

describe("progress changes", () => {
  it("requires both authentication and explicit reset confirmation", async () => {
    expect(await resetCourseProgress("course", false)).toHaveProperty("error")
    expect(mock.rpc).not.toHaveBeenCalled()
    mock.user.mockResolvedValue(null)
    expect(await resetCourseProgress("course", true)).toHaveProperty("error")
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it("delegates a reset to one current-user transaction without a supplied user id", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: null })
    expect(await resetCourseProgress("course", true)).toEqual({})
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("reset_course_progress", { p_course_id: "course" })
    expect(mock.revalidate).toHaveBeenCalledWith(null)
  })
  it("reports reset failure without claiming success", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "42501" } })
    expect(await resetCourseProgress("course", true)).toHaveProperty("error")
    expect(mock.revalidate).not.toHaveBeenCalled()
  })
  it("does not write progress outside the enrolled course", async () => {
    mock.access.mockResolvedValue({ ok: false, reason: "course_mismatch" })
    expect(await updateLastLesson("course", "other-lesson")).toHaveProperty("error")
    expect(mock.persist).not.toHaveBeenCalled()
  })
  it("reports last-access persistence errors", async () => {
    mock.persist.mockRejectedValueOnce(new Error("offline"))
    expect(await updateLastLesson("course", "lesson")).toHaveProperty("error")
  })
  it("recomputes completion from current lessons instead of stale snapshots", () => {
    expect(resolveEffectiveCourseProgress({ totalLessons: 3, actualCompletedLessons: 2, persistedProgress: { completed_lessons: 2, is_completed: true } }))
      .toMatchObject({ completedLessons: 2, percentage: 67, isCompleted: false, usedFallback: true })
    expect(resolveEffectiveCourseProgress({ totalLessons: 0, actualCompletedLessons: 4, persistedProgress: null }))
      .toMatchObject({ completedLessons: 0, percentage: 0, isCompleted: false })
  })
  it("uses one aggregate RPC rather than lesson lists and per-user writes", async () => {
    const supabase = { rpc: mock.rpc, from: mock.from } as unknown as SupabaseClient<Database>
    await syncCourseProgressSnapshot({ supabase, userId: "student", courseId: "course", lastLessonId: "lesson", touchLastAccess: true })
    expect(mock.rpc).toHaveBeenCalledWith("sync_student_course_progress", expect.objectContaining({ p_user_id: "student", p_course_id: "course", p_last_lesson_id: "lesson", p_set_last_lesson: true }))
    expect(mock.from).not.toHaveBeenCalled()
  })
  it("curriculum changes never fan out progress writes", async () => {
    const supabase = { rpc: mock.rpc, from: mock.from } as unknown as SupabaseClient<Database>
    expect(await syncCourseProgressForEnrolledUsers({ supabase, courseId: "course", courseSlug: "baile" })).toMatchObject({ updatedUsers: 0, courseSlug: "baile" })
    expect(mock.from).not.toHaveBeenCalled()
    expect(mock.rpc).not.toHaveBeenCalled()
  })
})
