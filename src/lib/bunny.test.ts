import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHash } from "node:crypto"

const mocks = vi.hoisted(() => ({ client: vi.fn(), playerVersion: vi.fn(() => "legacy") }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: mocks.client }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/env", () => ({ env: {
  BUNNY_LIBRARY_ID: () => "10", BUNNY_API_KEY: () => "fake-key",
  BUNNY_TOKEN_AUTH_KEY: () => "fake-token", BUNNY_PLAYER_VERSION: mocks.playerVersion,
} }))
import { deleteBunnyVideo, generateSignedUrl, reconcileBunnyVideoWebhook, reconcilePendingBunnyAssets } from "./bunny"

type Row = Record<string, unknown>
const activeId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const pendingId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
const newerId = "cccccccc-cccc-cccc-cccc-cccccccccccc"
let rows: Record<string, Row[]>
let failUpdate: boolean
let failRead: boolean
let queries: Array<{ table: string; limit?: number; orders: string[]; filters: Array<[string, unknown]> }>

// In-memory PostgREST double applies the REAL query predicates to current rows.
// Selected rows are copied, so mutation during a mocked provider response models
// a concurrent upload after the worker's initial read.
function client() {
  return { from(table: string) {
    const query = { table, limit: undefined as number | undefined, orders: [] as string[], filters: [] as Array<[string, unknown]> }
    queries.push(query)
    let changes: Row | undefined
    let insert: Row | undefined
    let orFilter: string | undefined
    const execute = (single = false) => {
      if ((!changes && failRead) || (changes && failUpdate)) return { data: null, error: { message: "simulated db failure" } }
      if (insert) { rows[table].push(insert); return { data: null, error: null } }
      let found = rows[table].filter((row) => query.filters.every(([key, value]) => row[key] === value))
      if (orFilter) found = found.filter((row) => orFilter!.split(",").some((filter) => {
        const [key, op, ...rest] = filter.split(".")
        const value = rest.join(".")
        if (op === "not") return row[key] != null
        if (op === "neq") return row[key] !== value
        return row[key] === value
      }))
      if (query.limit) found = found.slice(0, query.limit)
      if (changes) found.forEach((row) => Object.assign(row, changes))
      const copy = structuredClone(found)
      return { data: single ? copy[0] ?? null : copy, error: null }
    }
    const builder = {
      select: () => builder, update: (value: Row) => { changes = value; return builder },
      upsert: (value: Row) => { insert = value; return builder },
      eq: (key: string, value: unknown) => { query.filters.push([key, value]); return builder },
      is: (key: string, value: null) => { query.filters.push([key, value]); return builder },
      or: (value: string) => { orFilter = value; return builder },
      limit: (value: number) => { query.limit = value; return builder },
      order: (key: string) => { query.orders.push(key); return builder },
      maybeSingle: async () => execute(true),
      then: (resolve: (value: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve),
    }
    return builder
  } }
}
function lesson(overrides: Row = {}): Row {
  return { id: "lesson", course_id: "course", bunny_video_id: activeId, bunny_library_id: "10",
    bunny_status: "ready", bunny_last_checked_at: null, bunny_last_state_changed_at: null,
    pending_bunny_video_id: pendingId, pending_bunny_library_id: "10", pending_bunny_status: "processing",
    video_upload_error: null, duration_seconds: 120, courses: { id: "course", slug: "dance" }, ...overrides }
}
function course(overrides: Row = {}): Row {
  return { id: "course", slug: "dance", preview_video_url: null, preview_bunny_video_id: activeId,
    preview_bunny_library_id: "10", preview_status: "ready", preview_last_checked_at: null,
    preview_last_state_changed_at: null, pending_preview_bunny_video_id: pendingId,
    pending_preview_bunny_library_id: "10", pending_preview_status: "processing", preview_upload_error: null, ...overrides }
}
beforeEach(() => {
  rows = { lessons: [], courses: [], bunny_cleanup_queue: [] }; queries = []; failUpdate = false; failRead = false
  mocks.client.mockImplementation(client); mocks.playerVersion.mockReturnValue("legacy")
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: 4, length: 150 })))
})

describe("Bunny media integrity", () => {
  it.each(["lessons", "courses"])("promotes %s only after CAS and defers cleanup without DELETE", async (table) => {
    rows[table] = [table === "lessons" ? lesson() : course()]
    const result = await reconcilePendingBunnyAssets()
    expect(result.reconciled).toBe(1)
    expect(rows.bunny_cleanup_queue).toEqual([{ library_id: "10", video_id: activeId, status: "deferred" }])
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.method === "GET")).toBe(true)
  })
  it.each(["lessons", "courses"])("rejects stale %s promotion after a newer upload", async (table) => {
    rows[table] = [table === "lessons" ? lesson() : course()]
    const field = table === "lessons" ? "pending_bunny_video_id" : "pending_preview_bunny_video_id"
    vi.mocked(fetch).mockImplementationOnce(async () => {
      rows[table][0][field] = newerId
      return Response.json({ status: 4, length: 90 })
    })
    const result = await reconcilePendingBunnyAssets()
    expect(result.reconciled).toBe(0); expect(rows[table][0][field]).toBe(newerId)
    expect(rows.bunny_cleanup_queue).toHaveLength(0)
  })
  it("does not queue deletion or count success when promotion write fails", async () => {
    rows.lessons = [lesson()]; failUpdate = true
    const result = await reconcilePendingBunnyAssets()
    expect(result.errors).toBe(1); expect(result.reconciled).toBe(0)
    expect(rows.lessons[0].bunny_video_id).toBe(activeId); expect(rows.bunny_cleanup_queue).toHaveLength(0)
  })
  it("cannot write an old active asset's error onto a newly promoted video", async () => {
    rows.lessons = [lesson({ pending_bunny_video_id: null, pending_bunny_library_id: null, bunny_status: "processing" })]
    vi.mocked(fetch).mockImplementationOnce(async () => {
      rows.lessons[0].bunny_video_id = newerId; rows.lessons[0].bunny_status = "ready"
      return Response.json({ status: 5, length: 0 })
    })
    expect((await reconcilePendingBunnyAssets()).reconciled).toBe(0)
    expect(rows.lessons[0].bunny_status).toBe("ready")
  })
  it("keeps a playable current video when pending processing fails", async () => {
    rows.lessons = [lesson()]; vi.mocked(fetch).mockResolvedValue(Response.json({ status: 5, length: 0 }))
    await reconcilePendingBunnyAssets()
    expect(rows.lessons[0].bunny_video_id).toBe(activeId)
    expect(rows.lessons[0].bunny_status).toBe("ready")
    expect(rows.lessons[0].pending_bunny_status).toBe("error")
  })
  it("preserves state on transient provider failure", async () => {
    rows.lessons = [lesson()]; vi.mocked(fetch).mockRejectedValue(new Error("simulated timeout"))
    const result = await reconcilePendingBunnyAssets()
    expect(result.errors).toBe(1); expect(result.reconciled).toBe(0)
    expect(rows.lessons[0].pending_bunny_status).toBe("processing")
  })
  it.each(["bunny_video_id", "pending_bunny_video_id"])("retains assets referenced by %s", async (field) => {
    rows.lessons = [lesson({ [field]: newerId })]
    await deleteBunnyVideo(newerId)
    expect(rows.bunny_cleanup_queue).toHaveLength(0); expect(fetch).not.toHaveBeenCalled()
  })
  it("fails closed when reference lookups fail", async () => {
    failRead = true
    await expect(deleteBunnyVideo(activeId)).rejects.toThrow("reference check failed")
    expect(fetch).not.toHaveBeenCalled(); expect(rows.bunny_cleanup_queue).toHaveLength(0)
  })
  it("rejects webhook filter injection before database or provider access", async () => {
    await expect(reconcileBunnyVideoWebhook("id,preview_status.eq.ready")).rejects.toThrow("Invalid")
    expect(queries).toHaveLength(0); expect(fetch).not.toHaveBeenCalled()
  })
  it("webhook checks only the matching video, not unrelated course assets", async () => {
    rows.lessons = [lesson(), lesson({ id: "other", bunny_video_id: newerId, pending_bunny_video_id: null })]
    await reconcileBunnyVideoWebhook(pendingId)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it("bounds and orders work queries", async () => {
    await reconcilePendingBunnyAssets()
    expect(queries[0]).toMatchObject({ limit: 20, orders: ["preview_last_checked_at", "id"] })
    expect(queries[1]).toMatchObject({ limit: 20, orders: ["bunny_last_checked_at", "id"] })
  })
  it("does not query the configured library for an asset belonging to another", async () => {
    rows.lessons = [lesson({ pending_bunny_library_id: "other-library" })]
    expect((await reconcilePendingBunnyAssets()).errors).toBe(1); expect(fetch).not.toHaveBeenCalled()
  })
  it("surfaces work query errors instead of reporting empty success", async () => {
    failRead = true; await expect(reconcilePendingBunnyAssets()).rejects.toThrow("work lookup failed")
  })
  it("keeps legacy default and signs the opt-in v2 endpoint with the same token", () => {
    const legacy = new URL(generateSignedUrl(activeId))
    expect(legacy.hostname).toBe("iframe.mediadelivery.net")
    mocks.playerVersion.mockReturnValue("v2")
    const modern = new URL(generateSignedUrl(activeId))
    expect(modern.hostname).toBe("player.mediadelivery.net")
    expect(modern.searchParams.get("token")).toBe(createHash("sha256").update(`fake-token${activeId}${modern.searchParams.get("expires")}`).digest("hex"))
  })
})
