import { beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  user: null as { id: string } | null, enrolled: false,
  lessons: [] as Array<Record<string, unknown> | null>,
  fresh: vi.fn(), sign: vi.fn(() => "https://signed.example/video"),
  rate: vi.fn(),
}))
vi.mock("@/lib/supabase/auth", () => ({ getCurrentUser: async () => state.user }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: () => ({ from: () => {
  const query = { select: () => query, eq: () => query, single: async () => ({ data: state.lessons.shift() ?? null, error: null }) }
  return query
} }) }))
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({ from: () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: state.enrolled ? { id: "enrollment" } : null, error: null }) }
  return query
} }) }))
vi.mock("@/lib/bunny", () => ({ ensureCourseMediaFresh: state.fresh, generateSignedUrl: state.sign,
  resolveLessonAssetState: (lesson: { bunny_status: string; bunny_video_id: string }) => ({
    isPlayable: lesson.bunny_status === "ready", state: lesson.bunny_status,
    videoId: lesson.bunny_video_id, message: "Video en preparacion.",
  }),
}))
vi.mock("@/lib/course-progress", () => ({ syncCourseProgressSnapshot: vi.fn() }))
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: state.rate, enforcePublicRateLimit: state.rate }))
vi.mock("@/lib/video-progress", () => ({ persistLessonVideoPosition: vi.fn(), persistCourseLastAccess: vi.fn(), revalidateVideoProgressPaths: vi.fn(), resolveEnrolledLessonAccess: vi.fn() }))
import { getSignedVideoUrl } from "@/actions/lessons"

const lesson = (overrides = {}) => ({ id: "lesson", course_id: "course", bunny_video_id: "video",
  bunny_status: "processing", is_free: false, courses: { id: "course", is_published: true, archived_at: null }, ...overrides })
beforeEach(() => { state.user = null; state.enrolled = false; state.lessons = [lesson()]; state.fresh.mockResolvedValue({}); state.rate.mockResolvedValue({ allowed: true }) })

it("denies unauthenticated paid access before any provider request", async () => {
  expect((await getSignedVideoUrl("lesson")).url).toBe("")
  expect(state.fresh).not.toHaveBeenCalled(); expect(state.sign).not.toHaveBeenCalled()
})
it("denies non-enrolled paid access before refreshing media", async () => {
  state.user = { id: "student" }
  expect((await getSignedVideoUrl("lesson")).url).toBe("")
  expect(state.fresh).not.toHaveBeenCalled()
})
it("allows an enrolled student to watch an unpublished archived course", async () => {
  state.user = { id: "student" }; state.enrolled = true
  state.lessons = [lesson({ bunny_status: "ready", courses: { is_published: false, archived_at: "2026-09-02" } })]
  expect((await getSignedVideoUrl("lesson")).url).toBe("https://signed.example/video")
})
it("denies anonymous free samples from unpublished courses before refresh", async () => {
  state.lessons = [lesson({ is_free: true, courses: { is_published: false } })]
  expect((await getSignedVideoUrl("lesson")).url).toBe("")
  expect(state.fresh).not.toHaveBeenCalled()
})
it("denies archived public samples even if publication is still true", async () => {
  state.lessons = [lesson({ is_free: true, courses: { is_published: true, archived_at: "2026-09-02" } })]
  expect((await getSignedVideoUrl("lesson")).url).toBe("")
  expect(state.fresh).not.toHaveBeenCalled()
})
it("reauthorizes after refresh so public-to-private changes cannot be signed", async () => {
  state.lessons = [lesson({ is_free: true }), lesson({ bunny_status: "ready", is_free: false })]
  expect((await getSignedVideoUrl("lesson")).url).toBe("")
  expect(state.fresh).toHaveBeenCalledOnce(); expect(state.sign).not.toHaveBeenCalled()
})
it("does not sign a lesson that disappeared during refresh", async () => {
  state.lessons = [lesson({ is_free: true }), null]
  expect((await getSignedVideoUrl("lesson")).url).toBe("")
  expect(state.sign).not.toHaveBeenCalled()
})
it("rate limits eligible viewers before provider work", async () => {
  state.lessons = [lesson({ is_free: true })]; state.rate.mockResolvedValue({ allowed: false })
  expect((await getSignedVideoUrl("lesson")).url).toBe("")
  expect(state.fresh).not.toHaveBeenCalled(); expect(state.sign).not.toHaveBeenCalled()
})
