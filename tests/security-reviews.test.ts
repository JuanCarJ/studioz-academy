import { beforeEach, describe, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({
  user: vi.fn(), limit: vi.fn(), client: vi.fn(), rpc: vi.fn(), from: vi.fn(),
  select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
}))
vi.mock("@/lib/supabase/auth", () => ({ getCurrentUser: mock.user }))
vi.mock("@/lib/supabase/server", () => ({ createServerClient: mock.client }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: vi.fn() }))
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mock.limit, RATE_LIMIT_MESSAGE: "Espera unos minutos." }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { createReview, deleteReview, updateReview } from "@/actions/reviews"

function form(rating = "5", text = "Buen curso") {
  const data = new FormData()
  data.set("rating", rating)
  data.set("text", text)
  return data
}

beforeEach(() => {
  mock.user.mockResolvedValue({ id: "student-a", role: "user" })
  mock.limit.mockResolvedValue({ allowed: true })
  mock.rpc.mockResolvedValue({ data: true, error: null })
  mock.maybeSingle.mockResolvedValue({ data: null, error: null })
  mock.insert.mockResolvedValue({ error: null })
  const chain = {
    select: mock.select, eq: mock.eq, maybeSingle: mock.maybeSingle, insert: mock.insert,
    update: mock.update, delete: mock.delete,
    then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }),
  }
  mock.select.mockReturnValue(chain)
  mock.eq.mockReturnValue(chain)
  mock.update.mockReturnValue(chain)
  mock.delete.mockReturnValue(chain)
  mock.from.mockReturnValue(chain)
  mock.client.mockResolvedValue({ from: mock.from, rpc: mock.rpc })
})

describe("review write boundaries", () => {
  it("rejects visitors before rate-limit or data queries", async () => {
    mock.user.mockResolvedValue(null)
    expect(await createReview("course-a", form())).toHaveProperty("error")
    expect(mock.limit).not.toHaveBeenCalled()
    expect(mock.client).not.toHaveBeenCalled()
  })
  it("does not query or mutate reviews after a rate-limit denial", async () => {
    mock.limit.mockResolvedValue({ allowed: false })
    expect(await createReview("course-a", form())).toEqual({ error: "Espera unos minutos." })
    expect(mock.client).not.toHaveBeenCalled()
  })
  it.each(["0", "6", "3.5", "not-a-number"])("rejects invalid ratings: %s", async (rating) => {
    expect(await createReview("course-a", form(rating))).toHaveProperty("error")
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it("rejects a non-text form value without throwing", async () => {
    const data = form()
    data.set("text", new File(["payload"], "text.txt"))
    expect(await createReview("course-a", data)).toHaveProperty("error")
    expect(mock.insert).not.toHaveBeenCalled()
  })
  it.each([
    { data: false, error: null },
    { data: null, error: { message: "not available" } },
  ])("fails closed when eligibility is absent or unknown", async (response) => {
    mock.rpc.mockResolvedValue(response)
    expect(await createReview("course-a", form())).toHaveProperty("error")
    expect(mock.insert).not.toHaveBeenCalled()
  })
  it("creates only for the current student and checked course", async () => {
    const data = form("5", "  Buen curso  ")
    data.set("user_id", "student-b")
    data.set("is_visible", "true")
    expect(await createReview("course-a", data)).toEqual({ success: true })
    expect(mock.rpc).toHaveBeenCalledWith("can_review_course", { p_course_id: "course-a" })
    expect(mock.insert).toHaveBeenCalledWith({ user_id: "student-a", course_id: "course-a", rating: 5, text: "Buen curso" })
  })
  it("does not update someone else's review", async () => {
    mock.maybeSingle.mockResolvedValue({ data: { id: "review-b", user_id: "student-b", course_id: "course-a" } })
    expect(await updateReview("review-b", form())).toHaveProperty("error")
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.update).not.toHaveBeenCalled()
  })
  it("rechecks enrollment and approved purchase when editing", async () => {
    mock.maybeSingle.mockResolvedValue({ data: { id: "review-a", user_id: "student-a", course_id: "course-a" } })
    mock.rpc.mockResolvedValue({ data: false, error: null })
    expect(await updateReview("review-a", form())).toHaveProperty("error")
    expect(mock.update).not.toHaveBeenCalled()
  })
  it("permits deleting one's own review even after entitlement is revoked", async () => {
    mock.maybeSingle.mockResolvedValue({ data: { id: "review-a", user_id: "student-a" } })
    expect(await deleteReview("review-a")).toEqual({ success: true })
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.eq).toHaveBeenCalledWith("user_id", "student-a")
  })
})
