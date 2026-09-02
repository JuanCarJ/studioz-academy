import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const sql = readFileSync(new URL("../supabase/migrations/20260902000900_account_status_privileged_paths.sql", import.meta.url), "utf8")
const statusSql = readFileSync(new URL("../supabase/migrations/20260902000500_admin_operations.sql", import.meta.url), "utf8")

describe("account lifecycle SQL contracts (not database execution)", () => {
  it("blocks deleted/suspended JWT actors inside the definer function under lock", () => {
    expect(sql).toContain("actor_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role'")
    expect(sql).toContain("IF NOT actor_is_service THEN")
    expect(sql).toContain("IF actor_id IS NULL THEN")
    expect(sql).toContain("deleted_at IS NULL AND suspended_at IS NULL FOR SHARE")
    expect(sql).toContain("IF actor_id <> target_user_id AND NOT public.is_admin() THEN")
    expect(sql.indexOf("Active account required")).toBeLessThan(sql.indexOf("UPDATE public.profiles SET"))
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.anonymize_user_data(uuid) TO authenticated, service_role")
  })
  it("retains the original anonymization scope instead of deleting purchase history", () => {
    expect(sql).toContain("customer_name_snapshot = 'Anonimizado', customer_email_snapshot = 'anonimizado'")
    expect(sql).toContain("DELETE FROM public.cart_items WHERE user_id = target_user_id")
    expect(sql).toContain("DELETE FROM public.course_progress WHERE user_id = target_user_id")
    expect(sql).toContain("DELETE FROM public.lesson_progress WHERE user_id = target_user_id")
    expect(sql).not.toContain("DELETE FROM public.orders")
    expect(sql).not.toContain("DELETE FROM auth.users")
  })
  it("constrains only administrative asset mutations, not public reads", () => {
    expect(sql.match(/ON storage.objects AS RESTRICTIVE/g)).toHaveLength(3)
    expect(sql).toContain("FOR INSERT TO authenticated")
    expect(sql).toContain("FOR UPDATE TO authenticated")
    expect(sql).toContain("FOR DELETE TO authenticated")
    expect(sql.match(/bucket_id NOT IN \('course-thumbnails', 'editorial-assets'\)/g)).toHaveLength(4)
    expect(sql).not.toContain("FOR SELECT TO")
  })
  it("combines restrictive data policies with lifecycle-aware admin and account helpers", () => {
    expect(statusSql).toContain("role='admin' AND deleted_at IS NULL AND suspended_at IS NULL")
    expect(statusSql).toContain("CREATE POLICY active_account_gate")
    expect(statusSql).toContain("AS RESTRICTIVE FOR ALL TO authenticated")
    expect(statusSql).toContain("WITH CHECK ((SELECT public.is_active_account()))")
  })
})
