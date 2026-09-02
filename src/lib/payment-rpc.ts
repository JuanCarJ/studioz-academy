import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/types/database"

// Scoped adapter until types can be regenerated against authorized staging.
export type PaymentRpcName =
  | "create_checkout_order" | "apply_payment_event" | "apply_approved_order_effects"
  | "claim_email_outbox" | "finish_email_outbox" | "enqueue_purchase_email"
  | "claim_job_lease" | "release_job_lease" | "record_order_reversal"
  | "receive_payment_notification" | "process_payment_notifications" | "claim_payment_recheck"
  | "enroll_native_free_course"
  | "get_payable_checkout_order"

export async function paymentRpc<T>(client: SupabaseClient<Database>, name: PaymentRpcName, args: Record<string, Json>): Promise<T> {
  const rpc = client.rpc.bind(client) as unknown as (
    name: PaymentRpcName, args: Record<string, Json>
  ) => Promise<{ data: T | null; error: { message: string } | null }>
  const { data, error } = await rpc(name, args)
  if (error || data === null) throw new Error(`Payment transaction failed: ${name}`)
  return data
}
