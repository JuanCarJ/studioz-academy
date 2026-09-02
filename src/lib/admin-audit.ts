import "server-only"
import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import type { Json } from "@/types/database"

export async function recordAdminAuditLog(input: {
  action: string
  entityType: string
  entityId?: string | null
  beforeData?: Json | null
  afterData?: Json | null
  result?: "success" | "error"
  metadata?: Json | null
}) {
  const actor = await getCurrentUser()
  const admin = actor?.role === "admin" ? actor : null
  if (!admin) throw new Error("No autorizado para registrar el cambio.")

  const supabase = createServiceRoleClient()

  const { error } = await supabase.from("admin_audit_logs").insert({
    admin_user_id: admin.id,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    before_data: input.beforeData ?? null,
    after_data: input.afterData ?? null,
    result: input.result ?? "success",
    metadata: input.metadata ?? null,
  })
  if (error) {
    // Do not log snapshots or provider error messages containing user data.
    console.error("[admin.audit] persistence failed", { code: error.code })
    throw new Error("No se pudo guardar el historial del cambio. Revisa el registro antes de volver a intentarlo.")
  }
}
