"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { enqueuePurchaseConfirmation as enqueue } from "@/lib/email-outbox"

// Only deliberately authorized administrative resends are browser-callable.
// Workers and payment transactions import the server-only library directly.
export async function enqueuePurchaseConfirmation(orderId: string): Promise<void> {
  const admin = await getCurrentUser()
  if (!admin || admin.role !== "admin") throw new Error("No autorizado")
  await enqueue(orderId, true)
}
