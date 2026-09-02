import { beforeEach, describe, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({ user: vi.fn(), cart: vi.fn(), client: vi.fn(), rpc: vi.fn(), eq: vi.fn(), in: vi.fn(), enrollment: { data: [] as { course_id: string }[], error: null as unknown } }))
vi.mock("@/lib/supabase/auth", () => ({ getCurrentUser: mock.user }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: () => ({ rpc: mock.rpc }) }))
vi.mock("@/lib/supabase/server", () => ({ createServerClient: mock.client }))
vi.mock("@/lib/cart", () => ({ getCartItemsForUser: mock.cart }))
vi.mock("@/lib/bunny", () => ({ COURSE_MEDIA_HEALTH_THROTTLE_MS: 0, ensureCourseMediaFresh: vi.fn(), resolveCoursePreview: vi.fn(), shouldRefreshCourseMediaHealth: vi.fn() }))
import { getCatalogUserState, getCourses } from "@/actions/courses"

beforeEach(() => {
  mock.user.mockResolvedValue({ id: "student-a", role: "user" })
  mock.cart.mockResolvedValue([])
  mock.enrollment = { data: [], error: null }
  const chain = { select: vi.fn(), eq: mock.eq, in: mock.in, then: (resolve: (value: typeof mock.enrollment) => unknown) => resolve(mock.enrollment) }
  chain.select.mockReturnValue(chain)
  mock.eq.mockReturnValue(chain)
  mock.in.mockReturnValue(chain)
  mock.client.mockResolvedValue({ from: () => chain })
})

describe("catalog personalized state", () => {
  it("does not show purchase/enrollment actions as available when enrollment lookup failed", async () => {
    mock.enrollment.error = { message: "offline" }
    await expect(getCatalogUserState(["course-a"])).rejects.toThrow("catalog_user_state_unavailable")
  })
  it("passes only rendered IDs to strict cart cleanup and enrollment lookup", async () => {
    await getCatalogUserState(["course-a", "course-a", "course-b"])
    expect(mock.cart).toHaveBeenCalledWith(expect.objectContaining({ userId: "student-a", courseIds: ["course-a", "course-b"], strict: true }))
    expect(mock.in).toHaveBeenCalledWith("course_id", ["course-a", "course-b"])
    expect(mock.eq).toHaveBeenCalledWith("user_id", "student-a")
  })
  it("does not query enrollment/cart data for a visitor", async () => {
    mock.user.mockResolvedValue(null)
    expect(await getCatalogUserState(["course-a"])).toEqual({ cartCourseIds: [], enrolledCourseIds: [], isAuthenticated: false })
    expect(mock.client).not.toHaveBeenCalled()
  })
  it("binds literal search rather than constructing a filter expression", async () => {
    mock.rpc.mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 12 }, error: null })
    await getCourses({ search: "Ana,(50%_off)", sort: "price_asc", page: "2" })
    expect(mock.rpc).toHaveBeenCalledWith("search_public_courses", {
      p_category: "", p_search: "Ana,(50%_off)", p_instructor: null, p_sort: "price_asc", p_page: 2, p_page_size: 12,
    })
  })
})

describe("optional strict cart reads", () => {
  it("preserves legacy empty-on-error behavior but throws for catalog strict mode", async () => {
    const { getCartItemsForUser } = await vi.importActual<typeof import("@/lib/cart")>("@/lib/cart")
    const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), in: vi.fn(), then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: { message: "offline" } }) }
    for (const method of [chain.select, chain.eq, chain.order, chain.in]) method.mockReturnValue(chain)
    const client = { from: () => chain } as unknown as Parameters<typeof getCartItemsForUser>[0]["supabase"]
    expect(await getCartItemsForUser({ supabase: client, userId: "student-a" })).toEqual([])
    await expect(getCartItemsForUser({ supabase: client, userId: "student-a", courseIds: ["course-a"], strict: true })).rejects.toThrow("cart_unavailable")
  })
})
