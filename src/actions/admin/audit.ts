"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"

import type { AdminAuditLog } from "@/types"
import { auditDateBoundary, decodeAdminPage, normalizeAuditFilters } from "@/lib/admin-review-audit"

async function verifyAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") return null
  return user
}

export async function listAuditLogs(query: Record<string, string | string[] | undefined> = {}) {
  const admin = await verifyAdmin()
  if (!admin) throw new Error("admin_required")
  const filters = normalizeAuditFilters(query)
  const { data, error } = await createServiceRoleClient().rpc("admin_audit_page", {
    p_action: filters.action, p_admin_search: filters.admin, p_entity_type: filters.entityType,
    p_result: filters.result, p_from: auditDateBoundary(filters.dateFrom),
    p_to: auditDateBoundary(filters.dateTo, true), p_page: filters.page,
  })
  if (error) throw new Error("audit_unavailable")
  const page = decodeAdminPage<Omit<AdminAuditLog, "result"> & { result: string; admin_name: string | null }>(data)
  return { ...page, items: page.items.map((row) => ({
    ...row,
    result: row.result === "error" ? "failure" : "success",
  })) }
}
