import { beforeEach, describe, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({
  user: vi.fn(), admin: vi.fn(), rpc: vi.fn(), from: vi.fn(), revalidate: vi.fn(),
  queries: [] as Array<{ table: string; method: string; args: unknown[] }>,
  tableErrors: {} as Record<string, { code: string; message: string }>,
}))
vi.mock("@/lib/supabase/auth", () => ({ getCurrentUser: mock.user }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: mock.admin }))
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }))
vi.mock("@/lib/email-outbox", () => ({ enqueuePurchaseConfirmation: vi.fn() }))

import { getContactInbox, getMediaQueue, getSupportNotes, performAdminOperation } from "@/actions/admin/operations"
import { getAdminDashboardData } from "@/actions/admin/dashboard"
import { getSalesSummary } from "@/actions/admin/orders"
import { ADMIN_OPERATIONS, UUID_PATTERN, normalizePage, validAdminOperation } from "@/lib/admin-operations"
import { auditDateBoundary } from "@/lib/admin-review-audit"

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const TARGET = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const COURSE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const operation = { action: "access.restore", targetId: TARGET, courseId: COURSE, reason: "Compra aprobada verificada." }
const sales = { totalOrders: 8, totalRevenue: 99000, averageOrderValue: 12375, totalDiscountGiven: 2000, topPaymentMethod: "CARD", statusDistribution: { approved: 8 } }
const queues = { stalePayments: 2, failedEmails: 3, unprocessedNotifications: 4, videoIssues: 5 }

function query(table: string) {
  const result = { data: [{ id: TARGET, title: "Curso", note: "Nota de soporte" }], count: 7, error: mock.tableErrors[table] ?? null }
  const chain: Record<string, unknown> = {
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
  }
  for (const method of ["select", "order", "range", "eq", "neq", "gte", "limit", "or"]) {
    chain[method] = (...args: unknown[]) => { mock.queries.push({ table, method, args }); return chain }
  }
  return chain
}

beforeEach(() => {
  mock.queries.length = 0
  for (const table of Object.keys(mock.tableErrors)) delete mock.tableErrors[table]
  mock.user.mockResolvedValue({ id: ADMIN, role: "admin" })
  mock.from.mockImplementation(query)
  mock.admin.mockReturnValue({ from: mock.from, rpc: mock.rpc })
  mock.rpc.mockImplementation(async (name: string) => ({
    data: name === "admin_sales_summary" ? sales : name === "admin_queue_health" ? queues : null,
    error: null,
  }))
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("admin operation authorization and input", () => {
  it.each([null, { id: TARGET, role: "user" }])("rejects non-admin identity before opening a privileged client (%o)", async (user) => {
    mock.user.mockResolvedValue(user)
    expect(await performAdminOperation(operation)).toEqual({ error: "No tienes permiso para realizar esta acción." })
    expect(mock.admin).not.toHaveBeenCalled()
    expect(mock.revalidate).not.toHaveBeenCalled()
  })
  it.each([
    { action: "access.grant" },
    { action: "arbitrary.sql" },
    { targetId: "not-a-uuid" },
    { targetId: "00000000-0000-0000-0000-000000000000" },
    { reason: " ab " },
    { reason: " " },
    { reason: "a".repeat(2001) },
  ])("rejects unapproved operations and invalid target/reason: %o", async (input) => {
    expect(await performAdminOperation({ ...operation, ...input })).toHaveProperty("error")
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it.each(["access.restore", "access.revoke", "progress.reset"])("requires a valid course for %s", async (action) => {
    expect(await performAdminOperation({ ...operation, action, courseId: "" })).toEqual({ error: "Selecciona un curso." })
    expect(await performAdminOperation({ ...operation, action, courseId: "other" })).toEqual({ error: "Selecciona un curso." })
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it("requires an allowed contact status", async () => {
    expect(await performAdminOperation({ ...operation, action: "contact.update", status: "closed" })).toEqual({ error: "Selecciona el estado del mensaje." })
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it.each(["new", "in_progress", "resolved"])("accepts contact status %s", async (status) => {
    expect(await performAdminOperation({ ...operation, action: "contact.update", status })).toEqual({ success: true })
  })
  it("sends the current administrator, normalized reason and bounded notes to one RPC", async () => {
    expect(await performAdminOperation({ ...operation, reason: "  Motivo válido  ", notes: "a".repeat(4100), assign: "me" })).toEqual({ success: true })
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("admin_operate", {
      p_admin_id: ADMIN, p_action: "access.restore", p_target_id: TARGET,
      p_input: { reason: "Motivo válido", courseId: COURSE, status: undefined, assign: "me", notes: "a".repeat(4000) },
    })
    expect(mock.revalidate.mock.calls).toEqual([["/admin", "layout"], ["/dashboard", "layout"], ["/cursos", "layout"]])
  })
  it.each([
    ["approved_purchase_required", "Solo se puede restaurar el acceso de una compra aprobada."],
    ["protected_account", "No puedes suspender una cuenta de administración."],
    ["internal-secret-detail", "No se pudo guardar el cambio. No se ha confirmado ninguna modificación; vuelve a intentarlo."],
  ])("translates RPC failure %s and never revalidates as success", async (message, expected) => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "42501", message } })
    expect(await performAdminOperation(operation)).toEqual({ error: expected })
    expect(mock.revalidate).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith("[admin.operation]", { action: "access.restore", code: "42501" })
  })
})

describe("admin operation helpers and bounded reads", () => {
  it("accepts only the enumerated operation names and valid RFC-shaped identifiers", () => {
    for (const action of ADMIN_OPERATIONS) expect(validAdminOperation(action, TARGET, "Motivo válido")).toBe(true)
    expect(UUID_PATTERN.test(TARGET.toUpperCase())).toBe(true)
    expect(UUID_PATTERN.test("aaaaaaaa-aaaa-9aaa-8aaa-aaaaaaaaaaaa")).toBe(false)
    expect(UUID_PATTERN.test("aaaaaaaa-aaaa-4aaa-7aaa-aaaaaaaaaaaa")).toBe(false)
    expect(validAdminOperation("user.note", TARGET, "a".repeat(2000))).toBe(true)
    expect(validAdminOperation("user.note", TARGET, " aaaa ")).toBe(false)
  })
  it.each([
    [undefined, 1], ["2", 2], [2.9, 2], [-10, 1], [0, 1],
    [Infinity, 1], [NaN, 1], ["not-a-number", 1], [10001, 10000],
  ])("normalizes page %s into %s", (value, expected) => expect(normalizePage(value)).toBe(expected))
  it("returns explicit permission errors and no privileged reads to non-admins", async () => {
    mock.user.mockResolvedValue({ id: TARGET, role: "user" })
    expect(await getContactInbox("new", -2)).toMatchObject({ messages: [], page: 1, error: "No autorizado." })
    expect(await getSupportNotes(TARGET)).toEqual([])
    expect(await getMediaQueue()).toBeNull()
    expect(mock.admin).not.toHaveBeenCalled()
  })
  it("paginates inbox deterministically and applies only known statuses", async () => {
    expect(await getContactInbox("in_progress", 2)).toMatchObject({ totalCount: 7, page: 2 })
    expect(mock.queries).toContainEqual({ table: "contact_messages", method: "range", args: [25, 49] })
    expect(mock.queries).toContainEqual({ table: "contact_messages", method: "order", args: ["id"] })
    expect(mock.queries).toContainEqual({ table: "contact_messages", method: "eq", args: ["status", "in_progress"] })
    mock.queries.length = 0
    await getContactInbox("anything")
    expect(mock.queries.some((entry) => entry.method === "eq")).toBe(false)
  })
  it("exposes inbox and media failures rather than silently claiming a clean queue", async () => {
    mock.tableErrors.contact_messages = { code: "offline", message: "internal" }
    mock.tableErrors.lessons = { code: "offline", message: "internal" }
    expect(await getContactInbox()).toHaveProperty("error", "No pudimos cargar los mensajes. Vuelve a intentarlo.")
    expect(await getMediaQueue()).toMatchObject({ error: true })
  })
  it("validates support ids and caps returned notes", async () => {
    expect(await getSupportNotes("invalid")).toEqual([])
    expect(mock.admin).not.toHaveBeenCalled()
    await getSupportNotes(TARGET)
    expect(mock.queries).toContainEqual({ table: "user_support_notes", method: "eq", args: ["user_id", TARGET] })
    expect(mock.queries).toContainEqual({ table: "user_support_notes", method: "limit", args: [25] })
  })
})

describe("dashboard and sales summary evidence", () => {
  it("uses inclusive Bogotá calendar days and an exclusive following midnight", async () => {
    expect(await getSalesSummary({ dateFrom: "2026-09-01", dateTo: "2026-09-02" })).toEqual(sales)
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("admin_sales_summary", {
      p_from: "2026-09-01T05:00:00.000Z", p_to: "2026-09-03T05:00:00.000Z",
    })
  })
  it("handles month/year rollovers and rejects invalid calendar dates", () => {
    expect(auditDateBoundary("2026-12-31", true)).toBe("2027-01-01T05:00:00.000Z")
    expect(auditDateBoundary("2024-02-29", true)).toBe("2024-03-01T05:00:00.000Z")
    expect(auditDateBoundary("2026-02-29")).toBeNull()
    expect(auditDateBoundary("2026-04-31")).toBeNull()
    expect(auditDateBoundary("2026-09-01T00:00:00Z")).toBeNull()
  })
  it.each([
    { data: null, error: null },
    { data: null, error: { code: "42501", message: "denied" } },
  ])("throws instead of reporting zero sales for failed/absent summaries (%o)", async (result) => {
    mock.rpc.mockResolvedValue(result)
    await expect(getSalesSummary()).rejects.toThrow("No pudimos cargar el resumen de ventas.")
  })
  it("rejects dashboard access before queries for non-admins", async () => {
    mock.user.mockResolvedValue({ id: TARGET, role: "user" })
    await expect(getAdminDashboardData()).rejects.toThrow("No tienes permiso")
    expect(mock.admin).not.toHaveBeenCalled()
  })
  it("returns observed metrics and passes selected dates to the sales aggregate", async () => {
    const result = await getAdminDashboardData({ dateFrom: "2026-09-01", dateTo: "2026-09-02" })
    expect(result).toMatchObject({ sales, queues, metrics: { pendingOrders: 7, publishedCourses: 7, publishedEvents: 7, galleryItems: 7, unreadContacts: 7 } })
    expect(mock.rpc).toHaveBeenCalledWith("admin_sales_summary", { p_from: "2026-09-01T05:00:00.000Z", p_to: "2026-09-03T05:00:00.000Z" })
    expect(mock.queries).toContainEqual({ table: "orders", method: "limit", args: [5] })
    expect(mock.queries).toContainEqual({ table: "admin_audit_logs", method: "limit", args: [6] })
  })
  it.each(["orders", "courses", "events", "gallery_items", "contact_messages", "admin_audit_logs"])("does not replace %s query failure with a zero KPI", async (table) => {
    mock.tableErrors[table] = { code: "offline", message: "unavailable" }
    await expect(getAdminDashboardData()).rejects.toThrow("No pudimos cargar el panel.")
  })
  it("does not replace missing queue-health evidence with zero issues", async () => {
    mock.rpc.mockImplementation(async (name: string) => ({ data: name === "admin_sales_summary" ? sales : null, error: null }))
    await expect(getAdminDashboardData()).rejects.toThrow("No pudimos cargar el panel.")
  })
})
