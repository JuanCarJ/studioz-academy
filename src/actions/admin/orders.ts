"use server"

import { createClient } from "@supabase/supabase-js"

import { createServiceRoleClient } from "@/lib/supabase/admin"
import { enqueuePurchaseConfirmation } from "@/actions/email"

import type { Order, OrderItem, PaymentEvent } from "@/types"

// Untyped client used only for tables not yet reflected in the generated types
// (order_email_outbox). The service role key never leaves the server.
function createRawServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const PAGE_SIZE = 20

export interface OrdersResult {
  orders: OrderListItem[]
  totalCount: number
  page: number
  pageSize: number
}

export interface OrderListItem {
  id: string
  reference: string
  customer_name_snapshot: string
  customer_email_snapshot: string
  total: number
  status: string
  payment_method: string | null
  created_at: string
  approved_at: string | null
  items_count: number
}

export interface OrderDetailResult {
  order: Order & { items: OrderItem[]; payment_events: PaymentEvent[] }
}

export interface SalesSummary {
  totalOrders: number
  totalRevenue: number
  averageOrderValue: number
  totalDiscountGiven: number
  topPaymentMethod: string | null
}

export async function getOrders(filters?: {
  status?: string
  dateFrom?: string
  dateTo?: string
  search?: string
  page?: number
}): Promise<OrdersResult> {
  const supabase = createServiceRoleClient()
  const page = Math.max(1, filters?.page ?? 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from("orders")
    .select(
      "id, reference, customer_name_snapshot, customer_email_snapshot, total, status, payment_method, created_at, approved_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to)

  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status)
  }

  if (filters?.dateFrom) {
    query = query.gte("created_at", filters.dateFrom)
  }

  if (filters?.dateTo) {
    // Include the full end day by appending end-of-day time
    query = query.lte("created_at", `${filters.dateTo}T23:59:59`)
  }

  if (filters?.search) {
    const term = filters.search.trim()
    query = query.or(
      `reference.ilike.%${term}%,customer_name_snapshot.ilike.%${term}%,customer_email_snapshot.ilike.%${term}%`
    )
  }

  const { data, count, error } = await query

  if (error) {
    console.error("[admin.getOrders]", error)
    return { orders: [], totalCount: 0, page, pageSize: PAGE_SIZE }
  }

  // Fetch items count per order
  const orderIds = (data ?? []).map((o) => o.id)
  const itemsCounts: Record<string, number> = {}

  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from("order_items")
      .select("order_id")
      .in("order_id", orderIds)

    for (const item of items ?? []) {
      itemsCounts[item.order_id] = (itemsCounts[item.order_id] ?? 0) + 1
    }
  }

  const orders: OrderListItem[] = (data ?? []).map((o) => ({
    id: o.id,
    reference: o.reference,
    customer_name_snapshot: o.customer_name_snapshot,
    customer_email_snapshot: o.customer_email_snapshot,
    total: o.total,
    status: o.status,
    payment_method: o.payment_method,
    created_at: o.created_at,
    approved_at: o.approved_at,
    items_count: itemsCounts[o.id] ?? 0,
  }))

  return {
    orders,
    totalCount: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  }
}

export async function getOrderDetail(
  orderId: string
): Promise<OrderDetailResult | null> {
  const supabase = createServiceRoleClient()

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single()

  if (error || !order) {
    console.error("[admin.getOrderDetail] order not found:", orderId, error)
    return null
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })

  const { data: paymentEvents } = await supabase
    .from("payment_events")
    .select(
      "id, order_id, source, wompi_transaction_id, external_status, mapped_status, is_applied, reason, payload_hash, processed_at"
    )
    .eq("order_id", orderId)
    .order("processed_at", { ascending: true })

  const typedStatus = order.status as Order["status"]

  return {
    order: {
      ...order,
      status: typedStatus,
      items: (items ?? []) as OrderItem[],
      payment_events: (paymentEvents ?? []).map((pe) => ({
        ...pe,
        payload_json: {},
      })) as PaymentEvent[],
    },
  }
}

export async function getSalesSummary(): Promise<SalesSummary> {
  const supabase = createServiceRoleClient()

  const { data: approvedOrders, error } = await supabase
    .from("orders")
    .select("total, discount_amount, payment_method")
    .eq("status", "approved")

  if (error) {
    console.error("[admin.getSalesSummary]", error)
    return {
      totalOrders: 0,
      totalRevenue: 0,
      averageOrderValue: 0,
      totalDiscountGiven: 0,
      topPaymentMethod: null,
    }
  }

  const orders = approvedOrders ?? []
  const totalOrders = orders.length
  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0)
  const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0
  const totalDiscountGiven = orders.reduce((sum, o) => sum + o.discount_amount, 0)

  // Tally payment methods
  const methodCounts: Record<string, number> = {}
  for (const o of orders) {
    if (o.payment_method) {
      methodCounts[o.payment_method] = (methodCounts[o.payment_method] ?? 0) + 1
    }
  }

  let topPaymentMethod: string | null = null
  let topCount = 0
  for (const [method, count] of Object.entries(methodCounts)) {
    if (count > topCount) {
      topCount = count
      topPaymentMethod = method
    }
  }

  return {
    totalOrders,
    totalRevenue,
    averageOrderValue,
    totalDiscountGiven,
    topPaymentMethod,
  }
}

export async function resendPurchaseEmail(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  // Use raw untyped client because order_email_outbox is not yet in the
  // generated Database types.
  const rawClient = createRawServiceClient()

  // Reset existing outbox entry to pending so the cron picks it up again,
  // or create a new one if it does not exist yet.
  const { error: upsertError } = await rawClient
    .from("order_email_outbox")
    .upsert(
      {
        order_id: orderId,
        email_type: "purchase_confirmation",
        status: "pending",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
      },
      { onConflict: "order_id" }
    )

  if (upsertError) {
    console.error("[admin.resendPurchaseEmail] upsert failed:", upsertError)
    // Fall back to direct enqueue helper which handles its own errors
    await enqueuePurchaseConfirmation(orderId)
  }

  return { success: true }
}
