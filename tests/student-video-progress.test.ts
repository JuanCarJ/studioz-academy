import { beforeEach, describe, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), admin: vi.fn(), auth: vi.fn(), server: vi.fn(), access: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: mock.admin }))
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }))
import { persistExitVideoProgress, persistLessonCompletion, persistLessonVideoPosition } from "@/lib/video-progress"

beforeEach(() => {
  mock.rpc.mockResolvedValue({ data: {}, error: null })
  mock.admin.mockReturnValue({ rpc: mock.rpc, from: mock.from })
})
describe("atomic student progress adapter", () => {
  it("records video position with one transaction including the aggregate", async () => {
    await persistLessonVideoPosition({ userId: "student", lessonId: "lesson", position: 42.9 })
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("record_student_lesson_progress", { p_user_id: "student", p_lesson_id: "lesson", p_video_position: 42 })
    expect(mock.from).not.toHaveBeenCalled()
  })
  it("records completion and uncompletion with the same locked transaction", async () => {
    await persistLessonCompletion({ userId: "student", lessonId: "lesson", completed: true })
    await persistLessonCompletion({ userId: "student", lessonId: "lesson", completed: false })
    expect(mock.rpc.mock.calls).toEqual([
      ["record_student_lesson_progress", { p_user_id: "student", p_lesson_id: "lesson", p_completed: true }],
      ["record_student_lesson_progress", { p_user_id: "student", p_lesson_id: "lesson", p_completed: false }],
    ])
    expect(mock.from).not.toHaveBeenCalled()
  })
  it("uses the same transaction for exit/pause saves", async () => {
    await persistExitVideoProgress({ userId: "student", courseId: "course", lessonId: "lesson", position: 0 })
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("record_student_lesson_progress", { p_user_id: "student", p_lesson_id: "lesson", p_video_position: 0 })
  })
  it.each([NaN, Infinity, -1, 2147483648])("rejects invalid positions before any data access (%s)", async (position) => {
    await expect(persistLessonVideoPosition({ userId: "student", lessonId: "lesson", position })).rejects.toThrow("Invalid video position")
    expect(mock.admin).not.toHaveBeenCalled()
  })
  it("propagates RPC failures for visible recovery without a separate fallback write", async () => {
    const error = new Error("failed transaction")
    mock.rpc.mockResolvedValue({ data: null, error })
    await expect(persistLessonCompletion({ userId: "student", lessonId: "lesson", completed: true })).rejects.toBe(error)
    expect(mock.from).not.toHaveBeenCalled()
  })
})
