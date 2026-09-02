"use server"
import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { paymentRpc } from "@/lib/payment-rpc"
import { reconcileOrder, type ReconciliationOrder } from "@/lib/payment-reconciliation"

type Result = { success: boolean; error?: string; applied?: boolean }

export async function reconcileOrderAdmin(orderId: string): Promise<Result> {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") return { success: false, error: "No autorizado." }
  const { data: order, error } = await createServiceRoleClient().from("orders").select("*").eq("id", orderId).maybeSingle()
  if (error || !order) return { success: false, error: "Orden no encontrada." }
  try {
    const result = await reconcileOrder(order as ReconciliationOrder)
    revalidatePath("/admin/ventas")
    return { success: true, applied: result.applied }
  } catch { return { success: false, error: "No se pudo confirmar el pago. El estado de la orden no se modificó sin confirmación." } }
}

// Records evidence of a reversal already confirmed externally. Never sends a
// refund/void request to Bold, a bank, or the legacy provider.
export async function recordConfirmedReversal(input: {
  orderId: string; status: "refunded" | "chargeback"; evidence: string; confirmed: boolean
}): Promise<Result> {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") return { success: false, error: "No autorizado." }
  if (!input.confirmed || !["refunded", "chargeback"].includes(input.status) || input.evidence.trim().length < 8 || input.evidence.length > 500) {
    return { success: false, error: "Debes confirmar el resultado externo e indicar su comprobante o referencia." }
  }
  try {
    const result = await paymentRpc<{ applied: boolean }>(createServiceRoleClient(), "record_order_reversal", {
      p_order_id: input.orderId, p_actor_id: user.id, p_status: input.status, p_evidence: input.evidence.trim(),
    })
    revalidatePath("/admin/ventas")
    revalidatePath("/dashboard")
    return { success: true, applied: result.applied }
  } catch { return { success: false, error: "No se pudo registrar la confirmación. Verifica el estado actual de la orden." } }
}
