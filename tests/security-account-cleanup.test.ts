import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({
  from: vi.fn(), remove: vi.fn(), user: vi.fn(), limit: vi.fn(), audit: vi.fn(),
  rpc: vi.fn(), signOut: vi.fn(), clear: vi.fn(), redirect: vi.fn(), revalidate: vi.fn(),
  updates: [] as unknown[], filters: [] as unknown[], queue: [] as Array<{ data: unknown; error: unknown; count?: number }>,
}))
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: () => ({ from: mock.from, auth: { admin: { deleteUser: mock.remove } } }) }))
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({ rpc: mock.rpc, auth: { signOut: mock.signOut } }) }))
vi.mock("@/lib/supabase/auth", () => ({ getCurrentUser: mock.user }))
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mock.limit, RATE_LIMIT_MESSAGE: "throttled" }))
vi.mock("@/lib/admin-audit", () => ({ recordAdminAuditLog: mock.audit }))
vi.mock("@/lib/supabase/cookies", () => ({ clearSupabaseAuthTokenCookies: mock.clear }))
vi.mock("next/navigation", () => ({ redirect: mock.redirect }))
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }))
import { completeAccountAuthCleanup } from "@/lib/account-cleanup"
import { requestAccountDeletion } from "@/actions/profile"
import { getPendingAccountCleanups, retryAccountAuthCleanup } from "@/actions/admin/account-cleanup"

const userId = "11111111-1111-4111-8111-111111111111"
const profile = { deleted_at: "2026-09-02T10:00:00Z", auth_cleanup_completed_at: null, auth_cleanup_started_at: null, auth_cleanup_attempts: 2 }
const result = (data: unknown) => ({ data, error: null })
beforeEach(() => {
  mock.queue = [result(profile), result({ id: userId }), result({ id: userId })]
  mock.updates = []; mock.filters = []
  mock.from.mockImplementation(() => {
    const chain = {
      select: vi.fn(() => chain), update: vi.fn((value) => { mock.updates.push(value); return chain }),
      eq: vi.fn((...args) => { mock.filters.push(args); return chain }),
      not: vi.fn(() => chain), is: vi.fn(() => chain), or: vi.fn(() => chain), order: vi.fn(() => chain),
      range: vi.fn(() => Promise.resolve(mock.queue.shift())), maybeSingle: vi.fn(() => Promise.resolve(mock.queue.shift())),
    }
    return chain
  })
  mock.remove.mockResolvedValue({ error: null })
  mock.user.mockResolvedValue({ id: userId, role: "admin" })
  mock.limit.mockResolvedValue({ allowed: true })
  mock.rpc.mockResolvedValue({ error: null })
  mock.audit.mockResolvedValue(undefined)
  mock.signOut.mockResolvedValue({ error: null })
  mock.clear.mockResolvedValue(undefined)
  mock.redirect.mockImplementation(() => { throw new Error("redirect") })
})

describe("durable Auth cleanup", () => {
  it("claims a bounded attempt then soft-deletes Auth and stores completion", async () => {
    expect(await completeAccountAuthCleanup(userId)).toEqual({ status: "complete" })
    expect(mock.remove).toHaveBeenCalledExactlyOnceWith(userId, true)
    expect(mock.updates[0]).toMatchObject({ auth_cleanup_attempts: 3, auth_cleanup_error: null })
    expect(mock.updates[1]).toMatchObject({ auth_cleanup_completed_at: expect.any(String), auth_cleanup_started_at: null, auth_cleanup_error: null })
    expect(mock.filters).toContainEqual(["auth_cleanup_attempts", 2])
    expect(mock.filters).toContainEqual(["auth_cleanup_attempts", 3])
  })
  it.each([[500, "auth_unavailable"], [429, "auth_rate_limited"], [400, "auth_rejected"]])("persists only an allowlisted error for Auth status %s", async (status, code) => {
    mock.remove.mockResolvedValue({ error: { status, code: "private provider code", message: "private email" } })
    expect(await completeAccountAuthCleanup(userId)).toEqual({ status: "pending" })
    expect(mock.updates[1]).toMatchObject({ auth_cleanup_completed_at: null, auth_cleanup_error: code })
    expect(JSON.stringify(mock.updates)).not.toContain("private")
  })
  it("keeps transport errors durable and treats absent Auth identities idempotently", async () => {
    mock.remove.mockRejectedValueOnce(new Error("offline"))
    expect(await completeAccountAuthCleanup(userId)).toEqual({ status: "pending" })
    expect(mock.updates[1]).toMatchObject({ auth_cleanup_error: "auth_transport_error" })
    mock.queue = [result(profile), result({ id: userId }), result({ id: userId })]
    mock.remove.mockResolvedValueOnce({ error: { code: "user_not_found" } })
    expect(await completeAccountAuthCleanup(userId)).toEqual({ status: "complete" })
  })
  it("refuses a live account and does not repeat completed cleanup", async () => {
    mock.queue = [result({ ...profile, deleted_at: null })]
    expect(await completeAccountAuthCleanup(userId)).toEqual({ status: "ineligible" })
    mock.queue = [result({ ...profile, auth_cleanup_completed_at: "2026-09-02T11:00:00Z" })]
    expect(await completeAccountAuthCleanup(userId)).toEqual({ status: "complete" })
    expect(mock.remove).not.toHaveBeenCalled()
  })
  it("does not enter Auth while an attempt owns the lease or loses the claim race", async () => {
    mock.queue = [result({ ...profile, auth_cleanup_started_at: new Date().toISOString() })]
    expect(await completeAccountAuthCleanup(userId)).toEqual({ status: "busy" })
    mock.queue = [result(profile), result(null)]
    expect(await completeAccountAuthCleanup(userId)).toEqual({ status: "busy" })
    expect(mock.remove).not.toHaveBeenCalled()
  })
  it("does not claim completion if the persistence receipt is missing", async () => {
    mock.queue[2] = { data: null, error: { code: "offline" } }
    expect(await completeAccountAuthCleanup(userId)).toEqual({ status: "pending" })
  })
})

describe("deletion and administrative recovery actions", () => {
  it("always clears the session after anonymization even when Auth cleanup and sign-out fail", async () => {
    mock.remove.mockRejectedValue(new Error("offline"))
    mock.signOut.mockRejectedValue(new Error("offline"))
    await expect(requestAccountDeletion()).rejects.toThrow("redirect")
    expect(mock.rpc).toHaveBeenCalledWith("anonymize_user_data", { target_user_id: userId })
    expect(mock.clear).toHaveBeenCalledOnce()
    expect(mock.redirect).toHaveBeenCalledWith("/login?message=account-deletion-requested")
  })
  it("does not clean Auth if anonymization was rejected", async () => {
    mock.rpc.mockResolvedValue({ error: { code: "denied" } })
    expect(await requestAccountDeletion()).toHaveProperty("error")
    expect(mock.remove).not.toHaveBeenCalled()
    expect(mock.clear).not.toHaveBeenCalled()
  })
  it.each([null, { id: userId, role: "user" }])("denies non-admin recovery actors", async (user) => {
    mock.user.mockResolvedValue(user)
    expect(await retryAccountAuthCleanup(userId)).toHaveProperty("error")
    expect(mock.from).not.toHaveBeenCalled()
    await expect(getPendingAccountCleanups()).rejects.toThrow("admin_required")
  })
  it("requires a valid target and a rate-limit allowance", async () => {
    expect(await retryAccountAuthCleanup("bad")).toHaveProperty("error")
    mock.limit.mockResolvedValue({ allowed: false })
    expect(await retryAccountAuthCleanup(userId)).toEqual({ error: "throttled" })
    expect(mock.remove).not.toHaveBeenCalled()
  })
  it("records retry intent before Auth and stops if recording fails", async () => {
    mock.audit.mockRejectedValue(new Error("audit offline"))
    await expect(retryAccountAuthCleanup(userId)).rejects.toThrow("audit offline")
    expect(mock.remove).not.toHaveBeenCalled()
  })
  it("reports successful recovery and refreshes the affected detail", async () => {
    expect(await retryAccountAuthCleanup(userId)).toEqual({ success: true })
    expect(mock.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "user.auth_cleanup", entityId: userId }))
    expect(mock.revalidate).toHaveBeenCalledWith(`/admin/usuarios/${userId}`)
  })
  it("clamps pending-list pagination and does not mask query failures as empty work", async () => {
    mock.queue = [{ data: [], error: null, count: 22 }, { data: [{ id: userId }], error: null, count: 22 }]
    expect(await getPendingAccountCleanups(99)).toMatchObject({ page: 2, totalCount: 22, pageSize: 20, items: [{ id: userId }] })
    mock.queue = [{ data: null, error: { code: "offline" } }]
    await expect(getPendingAccountCleanups()).rejects.toThrow("account_cleanup_unavailable")
  })
})

it("versioned SQL protects operational fields and indexes only pending requests (not SQL execution)", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260902001000_account_auth_cleanup.sql", import.meta.url), "utf8")
  expect(sql).toContain("auth_cleanup_attempts integer NOT NULL DEFAULT 0")
  expect(sql).toContain("auth_cleanup_started_at timestamptz")
  expect(sql).toContain("REVOKE UPDATE (auth_cleanup_completed_at")
  expect(sql).toContain("WHERE deleted_at IS NOT NULL AND auth_cleanup_completed_at IS NULL")
  expect(sql).not.toContain("DELETE FROM")
})
