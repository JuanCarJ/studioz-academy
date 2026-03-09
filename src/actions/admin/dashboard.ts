"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { getSalesSummary } from "@/actions/admin/orders"

export interface AdminDashboardData {
  metrics: {
    pendingOrders: number
    publishedCourses: number
    publishedPosts: number
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

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const admin = await verifyAdmin()
  if (!admin) {
    return {
      metrics: {
        pendingOrders: 0,
        publishedCourses: 0,
        publishedPosts: 0,
        publishedEvents: 0,
        galleryItems: 0,
        unreadContacts: 0,
      },
      sales: {
        totalOrders: 0,
        totalRevenue: 0,
        averageOrderValue: 0,
        totalDiscountGiven: 0,
        topPaymentMethod: null,
        statusDistribution: {},
      },
      recentOrders: [],
      recentAuditLogs: [],
    }
  }

  const supabase = createServiceRoleClient()
  const nowIso = new Date().toISOString()

  const [
    sales,
    pendingOrders,
    publishedCourses,
    publishedPosts,
    publishedEvents,
    galleryItems,
    unreadContacts,
    recentOrders,
    recentAuditLogs,
  ] = await Promise.all([
    getSalesSummary(),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("courses")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true),
    supabase
      .from("posts")
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
      .eq("is_read", false),
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

  return {
    metrics: {
      pendingOrders: pendingOrders.count ?? 0,
      publishedCourses: publishedCourses.count ?? 0,
      publishedPosts: publishedPosts.count ?? 0,
      publishedEvents: publishedEvents.count ?? 0,
      galleryItems: galleryItems.count ?? 0,
      unreadContacts: unreadContacts.count ?? 0,
    },
    sales,
    recentOrders: recentOrders.data ?? [],
    recentAuditLogs: recentAuditLogs.data ?? [],
  }
}
