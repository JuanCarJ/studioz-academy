"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/supabase/auth"
import { normalizePage, UUID_PATTERN } from "@/lib/admin-operations"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { completeAccountAuthCleanup } from "@/lib/account-cleanup"
import { enforceRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/security/rate-limit"
import { recordAdminAuditLog } from "@/lib/admin-audit"

export async function getPendingAccountCleanups(pageInput = 1) {
  const admin = await getCurrentUser()
  if (!admin || admin.role !== "admin") throw new Error("admin_required")
  const client = createServiceRoleClient()
  const requestedPage = normalizePage(pageInput)
  const pageSize = 20
  const query = (page: number) => client.from("profiles")
    .select("id, deleted_at, auth_cleanup_attempts", { count: "exact" })
    .not("deleted_at", "is", null).is("auth_cleanup_completed_at", null)
    .order("deleted_at").order("id").range((page - 1) * pageSize, page * pageSize - 1)
  let result = await query(requestedPage)
  if (result.error || !result.data || result.count === null) throw new Error("account_cleanup_unavailable")
  const totalCount = result.count
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(totalCount / pageSize)))
  if (page !== requestedPage) result = await query(page)
  if (result.error || !result.data) throw new Error("account_cleanup_unavailable")
  return { items: result.data, totalCount, page, pageSize }
}

export async function retryAccountAuthCleanup(userId: string): Promise<{ success?: boolean; error?: string }> {
  const admin = await getCurrentUser()
  if (!admin || admin.role !== "admin") return { error: "No autorizado." }
  if (!UUID_PATTERN.test(userId)) return { error: "Cuenta no encontrada." }
  if (!(await enforceRateLimit({ scope: "admin:account-cleanup", key: admin.id, limit: 10, windowSeconds: 600 })).allowed) {
    return { error: RATE_LIMIT_MESSAGE }
  }
  // Save intent before the external attempt; no claim of a cross-provider transaction.
  await recordAdminAuditLog({ action: "user.auth_cleanup", entityType: "user", entityId: userId,
    metadata: { operation: "retry_requested" } })
  const result = await completeAccountAuthCleanup(userId)
  revalidatePath(`/admin/usuarios/${userId}`)
  revalidatePath("/admin/auditoria")
  if (result.status === "complete") return { success: true }
  if (result.status === "ineligible") return { error: "Esta cuenta no tiene una solicitud de eliminación." }
  if (result.status === "busy") return { error: "Hay un intento en curso. Espera dos minutos y actualiza la ficha." }
  return { error: "La cuenta sigue desactivada. La eliminación continúa pendiente; puedes reintentar más tarde." }
}
