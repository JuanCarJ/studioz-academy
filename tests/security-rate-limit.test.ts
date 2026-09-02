import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHmac } from "node:crypto"

const mock = vi.hoisted(() => ({ rpc: vi.fn(), headers: vi.fn(), vercel: false }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: () => ({ rpc: mock.rpc }) }))
vi.mock("next/headers", () => ({ headers: mock.headers }))
vi.mock("@/lib/env", () => ({ env: {
  SUPABASE_SERVICE_ROLE_KEY: () => "local-test-key", IS_VERCEL: () => mock.vercel,
} }))
import { enforcePublicRateLimit, enforceRateLimit } from "@/lib/security/rate-limit"

const input = { scope: "login", key: "person@example.invalid", limit: 5, windowSeconds: 60 }
const digest = (scope: string, key: string) => createHmac("sha256", "local-test-key")
  .update(JSON.stringify([scope, key])).digest("hex")

beforeEach(() => {
  mock.vercel = false
  mock.rpc.mockReset().mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null })
  mock.headers.mockResolvedValue(new Headers())
})

describe("shared abuse limit", () => {
  it("persists an opaque HMAC key and returns the database decision", async () => {
    expect(await enforceRateLimit(input)).toEqual({ allowed: true, retryAfterSeconds: 0 })
    expect(mock.rpc).toHaveBeenCalledWith("consume_rate_limit", {
      p_key: digest(input.scope, input.key), p_limit: 5, p_window_seconds: 60,
    })
    expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain(input.key)
  })
  it("propagates denial without retrying the write", async () => {
    mock.rpc.mockResolvedValue({ data: [{ allowed: false, retry_after_seconds: 24 }], error: null })
    expect(await enforceRateLimit(input)).toEqual({ allowed: false, retryAfterSeconds: 24 })
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })
  it.each([
    { data: null, error: { message: "offline" } },
    { data: [], error: null },
    { data: [{ allowed: "true", retry_after_seconds: 0 }], error: null },
  ])("fails closed on missing or malformed RPC responses", async (response) => {
    mock.rpc.mockResolvedValue(response)
    expect((await enforceRateLimit(input)).allowed).toBe(false)
  })
  it("fails closed on a thrown outage", async () => {
    mock.rpc.mockRejectedValue(new Error("offline"))
    expect((await enforceRateLimit(input)).allowed).toBe(false)
  })
  it("does not call the database for an invalid limit", async () => {
    expect((await enforceRateLimit({ ...input, limit: 0 })).allowed).toBe(false)
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it("checks independent IP and subject buckets", async () => {
    mock.vercel = true
    mock.headers.mockResolvedValue(new Headers({ "x-vercel-forwarded-for": "203.0.113.5" }))
    await enforcePublicRateLimit("login", input.key, 5, 60)
    expect(mock.rpc.mock.calls.map((call) => call[1].p_key)).toEqual([
      digest("login:ip", "203.0.113.5"), digest("login:subject", input.key),
    ])
  })
  it("ignores spoofed proxy headers outside the trusted platform", async () => {
    mock.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.5", "x-vercel-forwarded-for": "203.0.113.5" }))
    await enforcePublicRateLimit("login", "", 5, 60)
    expect(mock.headers).not.toHaveBeenCalled()
    expect(mock.rpc.mock.calls[0][1].p_key).toBe(digest("login:ip", "shared"))
  })
  it("does not consume a subject bucket after an IP rejection", async () => {
    mock.rpc.mockResolvedValue({ data: [{ allowed: false, retry_after_seconds: 60 }], error: null })
    expect((await enforcePublicRateLimit("login", input.key, 5, 60)).allowed).toBe(false)
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })
})
