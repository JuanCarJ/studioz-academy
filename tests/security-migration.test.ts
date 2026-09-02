import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const sql = readFileSync(new URL("../supabase/migrations/20260902000100_audit_security_data.sql", import.meta.url), "utf8")

// Static contracts only. These tests do not execute SQL or prove live RLS.
describe("security migration contracts (not database execution)", () => {
  it("removes both unsafe profile policy families and grants only editable columns", () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Users update own profile"')
    expect(sql).toContain("DROP POLICY IF EXISTS profiles_update_own")
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.profiles FROM PUBLIC, anon, authenticated/)
    expect(sql).toContain("GRANT UPDATE (full_name, phone, avatar_url, email_notifications)")
  })
  it("blocks self-issued entitlements and forged purchases", () => {
    expect(sql).toContain("DROP POLICY IF EXISTS enrollments_insert_own")
    expect(sql).toContain("DROP POLICY IF EXISTS orders_insert_own")
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON public.enrollments, public.orders, public.order_items")
  })
  it("protects discount snapshots and retains historical course reads", () => {
    expect(sql).toContain("ALTER TABLE public.order_discount_lines ENABLE ROW LEVEL SECURITY")
    expect(sql).toMatch(/o\.id = order_discount_lines\.order_id AND o\.user_id = \(SELECT auth\.uid\(\)\)/)
    expect(sql).toContain("CREATE POLICY courses_select_enrolled")
  })
  it("requires membership, approved matching purchases and lesson/course integrity", () => {
    expect(sql).toContain("l.id = course_progress.last_lesson_id AND l.course_id = course_progress.course_id")
    expect(sql).toContain("o.status = 'approved' AND oi.course_id = e.course_id")
    expect(sql).toContain("o.id = e.order_id AND o.user_id = (SELECT auth.uid())")
    expect(sql).not.toContain("e.source = 'free' OR")
    expect(sql).toContain("AND public.can_review_course(course_id)")
    expect(sql).toContain("CREATE POLICY reviews_select_own")
  })
  it("makes the shared counter service-only, atomic, bounded and expiring", () => {
    expect(sql).toContain("ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain("ON CONFLICT (key) DO UPDATE SET")
    expect(sql).toContain("WHERE r.expires_at <= v_now OR r.attempts < p_limit")
    expect(sql).toContain("LIMIT 20 FOR UPDATE SKIP LOCKED")
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public.consume_rate_limit\(text, integer, integer\)\s+FROM PUBLIC, anon, authenticated/)
    expect(sql).toContain("DROP POLICY IF EXISTS contact_messages_insert_anon")
    expect(sql).toContain("DROP POLICY IF EXISTS avatars_user_insert ON storage.objects")
    expect(sql).toContain("DROP POLICY IF EXISTS avatars_user_update ON storage.objects")
  })
})
