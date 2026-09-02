"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { getSalesSummary } from "@/actions/admin/orders"

export interface AdminDashboardData {
  queues: { stalePayments: number; failedEmails: number; unprocessedNotifications: number; videoIssues: number }
  metrics: {
    pendingOrders: number
    publishedCourses: number
    publishedEvents: number
    galleryItems: number
    unreadContacts: number
  }
  sales: Awaited<ReturnType<typeof getSalesSummary>>
  recentOrders: {
    id: string
    reference: string
    status: string
    total: number
    created_at: string
  }[]
  recentAuditLogs: {
    id: string
    action: string
    entity_type: string
    result: string
    created_at: string
  }[]
}

async function verifyAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") return null
  return user
}

export async function getAdminDashboardData(filters?: { dateFrom?: string; dateTo?: string }): Promise<AdminDashboardData> {
  const admin = await verifyAdmin()
  if (!admin) {
    throw new Error("No tienes permiso para consultar el panel.")

  }

  const supabase = createServiceRoleClient()
  const nowIso = new Date().toISOString()

  const [
    sales,
    queues,
    pendingOrders,
    publishedCourses,
    publishedEvents,
    galleryItems,
    unreadContacts,
    recentOrders,
    recentAuditLogs,
  ] = await Promise.all([
    getSalesSummary(filters),
    supabase.rpc("admin_queue_health", {}),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("courses")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true)
      .gte("event_date", nowIso),
    supabase.from("gallery_items").select("id", { count: "exact", head: true }),
    supabase
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .neq("status", "resolved"),
    supabase
      .from("orders")
      .select("id, reference, status, total, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("admin_audit_logs")
      .select("id, action, entity_type, result, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
  ])

  const results = [queues,pendingOrders,publishedCourses,publishedEvents,galleryItems,unreadContacts,recentOrders,recentAuditLogs]
  if (results.some(result => result.error) || !queues.data) throw new Error("No pudimos cargar el panel. Vuelve a intentarlo.")
  return {
    queues: queues.data as unknown as AdminDashboardData["queues"],
    metrics: {
      pendingOrders: pendingOrders.count ?? 0,
      publishedCourses: publishedCourses.count ?? 0,
      publishedEvents: publishedEvents.count ?? 0,
      galleryItems: galleryItems.count ?? 0,
      unreadContacts: unreadContacts.count ?? 0,
    },
    sales,
    recentOrders: recentOrders.data ?? [],
    recentAuditLogs: recentAuditLogs.data ?? [],
  }
}
