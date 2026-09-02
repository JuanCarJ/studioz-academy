import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { auditDateBoundary, decodeAdminPage, normalizeAuditFilters, normalizeReviewFilters, pageQuery } from "@/lib/admin-review-audit"

const mock = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), insert: vi.fn() }))
vi.mock("@/lib/supabase/auth", () => ({ getCurrentUser: mock.user }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: () => ({ rpc: mock.rpc, from: () => ({ insert: mock.insert }) }) }))
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }))
import { deleteReviewAdmin, listAllReviews, moderateReview } from "@/actions/admin/reviews"
import { listAuditLogs } from "@/actions/admin/audit"
import { recordAdminAuditLog } from "@/lib/admin-audit"

const reviewId = "11111111-1111-4111-8111-111111111111"
beforeEach(() => {
  mock.user.mockResolvedValue({ id: "admin-a", role: "admin" })
  mock.rpc.mockResolvedValue({ data: { course_slug: "salsa" }, error: null })
  mock.insert.mockResolvedValue({ error: null })
})

describe("admin review moderation", () => {
  it.each([null, { id: "student-a", role: "user" }])("rejects non-admin actors before any privileged call", async (user) => {
    mock.user.mockResolvedValue(user)
    expect(await moderateReview(reviewId, false)).toHaveProperty("error")
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it("rejects malformed review identifiers", async () => {
    expect(await deleteReviewAdmin("not-an-id")).toHaveProperty("error")
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it("sends moderation and its server-derived actor to one audited transaction", async () => {
    expect(await moderateReview(reviewId, false)).toEqual({ success: true })
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("moderate_review_audited", {
      p_admin_id: "admin-a", p_review_id: reviewId, p_operation: "hide",
    })
    expect(mock.revalidate).toHaveBeenCalledWith("/cursos/salsa")
    expect(mock.revalidate).toHaveBeenCalledWith("/admin/auditoria")
  })
  it("deletes through the same audited boundary", async () => {
    await deleteReviewAdmin(reviewId)
    expect(mock.rpc.mock.calls[0][1].p_operation).toBe("delete")
  })
  it("does not report success or revalidate after an atomic transaction failure", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "audit insert failed" } })
    expect(await moderateReview(reviewId, true)).toHaveProperty("error")
    expect(mock.revalidate).not.toHaveBeenCalled()
  })
})

describe("admin list filtering", () => {
  it("does not silently accept a legacy audit write failure or log private snapshots", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    mock.insert.mockResolvedValue({ error: { code: "XX000", message: "private provider details" } })
    await expect(recordAdminAuditLog({ action: "combo.update", entityType: "discount_rule", beforeData: { private: "data" } })).rejects.toThrow("No se pudo guardar el historial")
    expect(log).toHaveBeenCalledWith("[admin.audit] persistence failed", { code: "XX000" })
    expect(JSON.stringify(log.mock.calls)).not.toContain("private")
  })
  it("uses the actual legacy entity names for combo/gallery filtering", () => {
    expect(normalizeAuditFilters({ entityType: "discount_rule" }).entityType).toBe("discount_rule")
    expect(normalizeAuditFilters({ entityType: "gallery_item" }).entityType).toBe("gallery_item")
  })
  it("preserves count/page metadata for reviews", async () => {
    mock.rpc.mockResolvedValue({ data: { items: [], total: 400, page: 2 }, error: null })
    expect(await listAllReviews({ search: "Ana", visibility: "hidden", rating: "2", page: "2" }))
      .toEqual({ items: [], total: 400, page: 2, pageSize: 25 })
    expect(mock.rpc.mock.calls[0][1]).toMatchObject({ p_search: "Ana", p_visibility: "hidden", p_rating: 2, p_page: 2 })
  })
  it("uses an inclusive Colombian calendar-date range for audit filters", async () => {
    mock.rpc.mockResolvedValue({ data: { items: [], total: 0, page: 1 }, error: null })
    await listAuditLogs({ dateFrom: "2026-09-02", dateTo: "2026-09-02", admin: "Ana", entityType: "review", result: "error" })
    expect(mock.rpc.mock.calls[0][1]).toMatchObject({ p_from: "2026-09-02T05:00:00.000Z", p_to: "2026-09-03T05:00:00.000Z", p_admin_search: "Ana", p_entity_type: "review", p_result: "error" })
  })
  it("does not disguise errors as empty history", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "offline" } })
    await expect(listAuditLogs()).rejects.toThrow("audit_unavailable")
    await expect(listAllReviews()).rejects.toThrow("reviews_unavailable")
  })
  it("sanitizes unsupported filters and preserves valid pagination links", () => {
    expect(normalizeReviewFilters({ rating: "2.5", visibility: "invalid", page: "-2" })).toMatchObject({ rating: null, visibility: "", page: 1 })
    expect(normalizeAuditFilters({ action: "anything", dateFrom: "2026-02-30", entityType: "bad" })).toMatchObject({ action: "", dateFrom: "", entityType: "" })
    expect(auditDateBoundary("not-a-date")).toBeNull()
    expect(pageQuery({ page: 3, rating: 2, search: "Ana", empty: "", absent: null })).toEqual({ rating: "2", search: "Ana" })
    expect(() => decodeAdminPage({ items: [], total: -1, page: 1 })).toThrow()
  })
})

describe("atomic moderation SQL contract (not SQL execution)", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260902000800_admin_reviews_audit.sql", import.meta.url), "utf8")
  it("checks active admin under lock and includes an immutable audit write", () => {
    expect(sql).toContain("deleted_at IS NULL AND suspended_at IS NULL FOR SHARE")
    expect(sql).toContain("WHERE r.id = p_review_id FOR UPDATE")
    expect(sql).toContain("INSERT INTO public.admin_audit_logs")
    expect(sql).toContain("v_before, v_after, 'success'")
    expect(sql).toContain("DROP POLICY IF EXISTS reviews_admin_all")
    expect(sql).toContain("REVOKE UPDATE (is_visible) ON public.reviews FROM authenticated")
    expect(sql).toContain("FROM PUBLIC, anon, authenticated")
  })
  it("counts all matching records before selecting a bounded page", () => {
    expect(sql).toContain("SELECT count(*) total FROM filtered")
    expect(sql.match(/LIMIT 25 OFFSET/g)).toHaveLength(2)
    expect(sql).toContain("a.created_at < p_to")
    expect(sql).not.toContain("LIMIT 200")
  })
})
