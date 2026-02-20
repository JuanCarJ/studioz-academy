"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"

export interface OrderItemSummary {
  course_title_snapshot: string
  price_at_purchase: number
}

export interface OrderSummary {
  id: string
  reference: string
  status: "pending" | "approved" | "declined" | "voided" | "refunded" | "chargeback"
  subtotal: number
  discount_amount: number
  total: number
  payment_method: string | null
  created_at: string
  approved_at: string | null
  items: OrderItemSummary[]
}

/**
 * Get all orders for the currently authenticated user, newest first.
 * Used by the "Mis Compras" dashboard page (US-040).
 */
export async function getUserOrders(): Promise<{
  orders: OrderSummary[]
  error?: string
}> {
  const user = await getCurrentUser()
  if (!user) return { orders: [], error: "AUTH_REQUIRED" }

  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      reference,
      status,
      subtotal,
      discount_amount,
      total,
      payment_method,
      created_at,
      approved_at,
      items:order_items(
        course_title_snapshot,
        price_at_purchase
      )
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[purchases] Failed to fetch user orders:", error)
    return { orders: [], error: "FETCH_ERROR" }
  }

  const orders: OrderSummary[] = (data ?? []).map((row) => ({
    id: row.id,
    reference: row.reference,
    status: row.status as OrderSummary["status"],
    subtotal: row.subtotal,
    discount_amount: row.discount_amount,
    total: row.total,
    payment_method: row.payment_method,
    created_at: row.created_at,
    approved_at: row.approved_at,
    items: (row.items as OrderItemSummary[]) ?? [],
  }))

  return { orders }
}
