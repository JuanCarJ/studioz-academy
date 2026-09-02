import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { paymentRpc } from "@/lib/payment-rpc"
import type { Database } from "@/types/database"

// Only a transaction may establish access. No independent enrollment/cart writes.
export async function applyApprovedOrderEffects(input: { supabase: SupabaseClient<Database>; orderId: string; userId: string }) {
  return paymentRpc<boolean>(input.supabase, "apply_approved_order_effects", { p_order_id: input.orderId })
}
