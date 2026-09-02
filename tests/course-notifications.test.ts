import { beforeEach, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
const mock = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn(), user: vi.fn(), rate: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: () => ({ rpc: mock.rpc }) }))
vi.mock("@/lib/supabase/auth", () => ({ getCurrentUser: mock.user }))
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mock.rate }))
vi.mock("@/lib/resend", () => ({ sendEmail: mock.send }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import { processCourseNotificationBatch, scheduleCourseNotification } from "@/lib/course-notifications"
import { sendNewCourseEmail } from "@/actions/admin/notifications"

const entry = { id: "delivery-id", recipient_email: "student@example.test", kind: "course", course_title: "Dance",
  description: "Learn dance", course_url: "https://example.test/cursos/dance", preferences_url: "https://example.test/dashboard/perfil", eligible: true, retry_expired: false }
let entries: Array<typeof entry>
beforeEach(() => {
  entries = [{ ...entry }]
  mock.rpc.mockImplementation(async (name: string) => ({ data:
    name === "materialize_course_notification_batch" ? 100 : name === "claim_course_notifications" ? entries : name === "schedule_course_notification" ? "campaign-id" : true, error: null }))
  mock.send.mockResolvedValue({ id: "provider-id" }); mock.user.mockResolvedValue({ id: "admin", role: "admin" }); mock.rate.mockResolvedValue({ allowed: true })
})
it("schedules without loading recipients or contacting the email provider", async () => {
  expect(await scheduleCourseNotification("admin", "course")).toBe("campaign-id")
  expect(mock.rpc).toHaveBeenCalledOnce(); expect(mock.send).not.toHaveBeenCalled()
})
it("limits audience and provider batches and reports confirmed outcome", async () => {
  expect(await processCourseNotificationBatch()).toEqual({ scheduled: 100, processed: 1, sent: 1, skipped: 0, failed: 0 })
  expect(mock.rpc).toHaveBeenCalledWith("materialize_course_notification_batch", { p_limit: 100 })
  expect(mock.rpc).toHaveBeenCalledWith("claim_course_notifications", expect.objectContaining({ p_limit: 3 }))
  expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "course-notification/delivery-id", to: entry.recipient_email }))
})
it("skips recipients whose consent, account, email, or course eligibility changed", async () => {
  entries[0].eligible = false
  expect((await processCourseNotificationBatch()).skipped).toBe(1); expect(mock.send).not.toHaveBeenCalled()
  expect(mock.rpc).toHaveBeenCalledWith("finish_course_notification", expect.objectContaining({ p_result: "skipped" }))
})
it("does not retry outside the provider deduplication safety window", async () => {
  entries[0].retry_expired = true
  expect((await processCourseNotificationBatch()).failed).toBe(1); expect(mock.send).not.toHaveBeenCalled()
  expect(mock.rpc).toHaveBeenCalledWith("finish_course_notification", expect.objectContaining({ p_result: "expired" }))
})
it("retries ambiguous sends with identical snapshot and idempotency key", async () => {
  mock.send.mockRejectedValueOnce(new Error("timeout"))
  expect((await processCourseNotificationBatch()).failed).toBe(1)
  expect((await processCourseNotificationBatch()).sent).toBe(1)
  expect(mock.send.mock.calls[0][0]).toEqual(mock.send.mock.calls[1][0])
})
it("does not count acceptance as completed when its lease was lost", async () => {
  mock.rpc.mockImplementation(async (name: string) => ({ data: name === "materialize_course_notification_batch" ? 0 : name === "claim_course_notifications" ? entries : false, error: null }))
  const stats = await processCourseNotificationBatch()
  expect(stats.sent).toBe(0); expect(stats.failed).toBe(1)
})
it("stops on database errors rather than returning fake sent counts", async () => {
  mock.rpc.mockResolvedValue({ data: null, error: { message: "failed" } })
  await expect(processCourseNotificationBatch()).rejects.toThrow("Notification operation failed")
  expect(mock.send).not.toHaveBeenCalled()
})
it("uses lesson copy and the snapshotted lesson URL for enrolled announcements", async () => {
  entries = [{ ...entry, kind: "lesson", course_url: "https://example.test/dashboard/cursos/dance?lesson=1" }]
  await processCourseNotificationBatch()
  expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ subject: "Nueva leccion: Dance" }))
})
function form(confirmed = true) {
  const value = new FormData(); value.set("courseId", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
  if (confirmed) value.set("confirmed", "yes")
  return value
}
it("requires administrator authority before scheduling", async () => {
  mock.user.mockResolvedValue({ role: "user" })
  expect((await sendNewCourseEmail({}, form())).error).toBeTruthy(); expect(mock.rpc).not.toHaveBeenCalled()
})
it("requires explicit confirmation", async () => {
  expect((await sendNewCourseEmail({}, form(false))).error).toBeTruthy(); expect(mock.rpc).not.toHaveBeenCalled()
})
it("describes successful scheduling without claiming email delivery", async () => {
  const result = await sendNewCourseEmail({}, form())
  expect(result.success).toContain("programado"); expect(mock.send).not.toHaveBeenCalled()
})
it("rate limits campaigns", async () => {
  mock.rate.mockResolvedValue({ allowed: false })
  expect((await sendNewCourseEmail({}, form())).error).toBeTruthy(); expect(mock.rpc).not.toHaveBeenCalled()
})
it("migration declares durable uniqueness, leases, consent recheck and privileged-only access (not DB execution)", () => {
  const sql = readFileSync("supabase/migrations/20260902000700_course_notification_outbox.sql", "utf8")
  expect(sql).toContain("unique (campaign_id,user_id)")
  expect(sql).toContain("event_key text not null unique")
  expect(sql).toContain("for update skip locked")
  expect(sql).toContain("p.email_notifications and p.deleted_at is null and p.suspended_at is null")
  expect(sql).toContain("q.lease_token=p_token")
  expect(sql).toContain("interval '23 hours'")
  expect(sql).toContain("from public,anon,authenticated")
  expect(sql).toContain("before delete on public.profiles")
})
