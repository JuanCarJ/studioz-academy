"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import {
  isMissingDiscountRuleNameSnapshotColumn,
  readDiscountRuleNameSnapshot,
} from "@/lib/discount-rule-snapshot"
import { createServerClient } from "@/lib/supabase/server"
import type { OrderDiscountLine } from "@/types"

export interface OrderItemSummary {
  course_title_snapshot: string
  price_at_purchase: number
  list_price_snapshot: number
  course_discount_amount_snapshot: number
  price_after_course_discount_snapshot: number
  combo_discount_amount_snapshot: number
  final_price_snapshot: number
}

export interface OrderSummary {
  id: string
  reference: string
  status: "pending" | "approved" | "declined" | "voided" | "refunded" | "chargeback"
  list_subtotal: number
  subtotal: number
  course_discount_amount: number
  combo_discount_amount: number
  discount_amount: number
  discount_rule_name: string | null
  total: number
  payment_method: string | null
  created_at: string
  approved_at: string | null
  items: OrderItemSummary[]
  discount_lines: OrderDiscountLine[]
}

function resolveDiscountRuleName(input: {
  discountAmount: number
  snapshotName: string | null
  joinedName: string | null
}): string | null {
  if (input.snapshotName) return input.snapshotName
  if (input.joinedName) return input.joinedName
  if (input.discountAmount > 0) return "Descuento aplicado"
  return null
}

/**
 * Get all orders for the currently authenticated user, newest first.
 * Used by the "Mis Compras" dashboard page (US-040).
 */
export async function getUserOrders(input: { page?: number; pageSize?: number } = {}): Promise<{
  orders: OrderSummary[]
  total: number
  page: number
  pageSize: number
  error?: string
}> {
  const page = Number.isFinite(input.page) ? Math.max(1, Math.min(10000, Math.floor(input.page!))) : 1
  const pageSize = Number.isFinite(input.pageSize) ? Math.max(1, Math.min(48, Math.floor(input.pageSize!))) : 12
  const from = (page - 1) * pageSize
  const user = await getCurrentUser()
  if (!user) return { orders: [], total: 0, page, pageSize, error: "AUTH_REQUIRED" }

  const supabase = await createServerClient()
  const baseSelect = `
      id,
      reference,
      status,
      list_subtotal,
      subtotal,
      course_discount_amount,
      combo_discount_amount,
      discount_amount,
      discount_rules(name),
      total,
      payment_method,
      created_at,
      approved_at,
      items:order_items(
        course_title_snapshot,
        price_at_purchase,
        list_price_snapshot,
        course_discount_amount_snapshot,
        price_after_course_discount_snapshot,
        combo_discount_amount_snapshot,
        final_price_snapshot
      ),
      discount_lines:order_discount_lines(*)
    `

  let data: Array<Record<string, unknown>> | null = null
  let error: unknown = null
  let total = 0

  const snapshotQuery = await supabase
    .from("orders")
    .select(`${baseSelect}, discount_rule_name_snapshot`, { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1) as {
    data: Array<Record<string, unknown>> | null
    error: unknown
    count: number | null
  }

  data = snapshotQuery.data
  error = snapshotQuery.error
  total = snapshotQuery.count ?? 0

  if (isMissingDiscountRuleNameSnapshotColumn(error as Record<string, unknown> | null)) {
    const legacyQuery = await supabase
      .from("orders")
      .select(baseSelect, { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1) as {
      data: Array<Record<string, unknown>> | null
      error: unknown
      count: number | null
    }

    data = legacyQuery.data
    error = legacyQuery.error
    total = legacyQuery.count ?? 0
  }

  if (error) {
    console.error("[purchases] Failed to fetch user orders:", error)
    return { orders: [], total: 0, page, pageSize, error: "FETCH_ERROR" }
  }

  const orders: OrderSummary[] = (data ?? []).map((row) => ({
    id: row.id as string,
    reference: row.reference as string,
    status: row.status as OrderSummary["status"],
    list_subtotal: (row.list_subtotal as number | null) ?? (row.subtotal as number),
    subtotal: row.subtotal as number,
    course_discount_amount: (row.course_discount_amount as number | null) ?? 0,
    combo_discount_amount: (row.combo_discount_amount as number | null) ?? 0,
    discount_amount: row.discount_amount as number,
    discount_rule_name: resolveDiscountRuleName({
      discountAmount: row.discount_amount as number,
      snapshotName: readDiscountRuleNameSnapshot(row),
      joinedName: Array.isArray(row.discount_rules)
        ? (row.discount_rules[0]?.name ?? null)
        : ((row.discount_rules as { name?: string } | null)?.name ?? null),
    }),
    total: row.total as number,
    payment_method: (row.payment_method as string | null) ?? null,
    created_at: row.created_at as string,
    approved_at: (row.approved_at as string | null) ?? null,
    items: (row.items as OrderItemSummary[]) ?? [],
    discount_lines: (row.discount_lines as OrderDiscountLine[]) ?? [],
  }))

  return { orders, total, page, pageSize }
}
