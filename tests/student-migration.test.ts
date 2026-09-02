import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const sql = readFileSync("supabase/migrations/20260902000300_student_progress.sql", "utf8")
// Static contract checks only. This is not PostgreSQL execution or RLS evidence.
describe("student migration source contract", () => {
  it("scopes aggregate reads to auth.uid and caps returned pages", () => {
    expect(sql).toContain("WHERE e.user_id = (SELECT auth.uid())")
    expect(sql).toContain("LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''")
    expect(sql).toContain("LIMIT LEAST(48, GREATEST(1, COALESCE(p_page_size, 12)))")
  })
  it("derives new lessons from last access and clears completed state when the curriculum expands", () => {
    expect(sql).toContain("l.created_at > COALESCE(cp.last_accessed_at, e.enrolled_at)")
    expect(sql).toContain("counts.completed_lessons = counts.total_lessons AS is_completed")
  })
  it("keeps user-selectable privileged writers unavailable to students", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.sync_student_course_progress(uuid, uuid, uuid, boolean, boolean, timestamptz) FROM PUBLIC, anon, authenticated")
    expect(sql).toContain("REVOKE ALL ON FUNCTION private.sync_student_course_progress(uuid, uuid, uuid, boolean, boolean, timestamptz) FROM PUBLIC, anon, authenticated")
  })
  it("authenticates and locks enrollment before resetting both progress tables", () => {
    const reset = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION private.reset_course_progress"))
    expect(reset).toContain("v_user_id uuid := auth.uid()")
    expect(reset.indexOf("FOR UPDATE")).toBeLessThan(reset.indexOf("UPDATE public.lesson_progress"))
    expect(reset).toContain("completed = false, completed_at = NULL, video_position = 0")
    expect(reset).toContain("last_lesson_id = NULL, completed_lessons = 0, is_completed = false")
    expect(reset).not.toContain("DELETE FROM public.enrollments")
  })
  it("checks active accounts in every privileged progress writer", () => {
    expect(sql.match(/deleted_at IS NULL AND suspended_at IS NULL/g)).toHaveLength(3)
  })
  it("locks enrollment before lesson writes and updates the aggregate in the same transaction", () => {
    const write = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION private.record_student_lesson_progress"))
    expect(write.indexOf("FOR UPDATE")).toBeLessThan(write.indexOf("INSERT INTO public.lesson_progress"))
    expect(write).toContain("RETURN private.sync_student_course_progress")
    expect(write).toContain("FROM PUBLIC, anon, authenticated")
  })
})
