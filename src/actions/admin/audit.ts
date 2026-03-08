"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"

import type { AdminAuditLog } from "@/types"
import type { Json } from "@/types/database"

async function verifyAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") return null
  return user
}

export async function recordAdminAuditLog(input: {
  action: string
  entityType: string
  entityId?: string | null
  beforeData?: Json | null
  afterData?: Json | null
  result?: "success" | "error"
  metadata?: Json | null
}) {
  const admin = await verifyAdmin()
  if (!admin) return

  const supabase = createServiceRoleClient()

  await supabase.from("admin_audit_logs").insert({
    admin_user_id: admin.id,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    before_data: input.beforeData ?? null,
    after_data: input.afterData ?? null,
    result: input.result ?? "success",
    metadata: input.metadata ?? null,
  })
}

export async function listAuditLogs(filters?: {
  action?: string
  userId?: string
  dateFrom?: string
}): Promise<AdminAuditLog[]> {
  const admin = await verifyAdmin()
  if (!admin) return []

  const supabase = createServiceRoleClient()
  let query = supabase
    .from("admin_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200)

  if (filters?.action) {
    query = query.ilike("action", `%${filters.action.trim()}%`)
  }

  if (filters?.userId) {
    query = query.eq("admin_user_id", filters.userId)
  }

  if (filters?.dateFrom) {
    query = query.gte("created_at", filters.dateFrom)
  }

  const { data, error } = await query
  if (error) {
    console.error("[admin.audit] Failed to list audit logs:", error)
    return []
  }

  return (data ?? []).map((row) => ({
    ...row,
    result: row.result === "error" ? "failure" : "success",
  })) as AdminAuditLog[]
}
