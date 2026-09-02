"use server"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"

import { normalizePage } from "@/lib/admin-operations"
import type { OrderItem, Course } from "@/types"

const PAGE_SIZE = 20

async function verifyAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") {
    return null
  }
  return user
}

export interface UserListItem {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: string
  last_login_at: string | null
  created_at: string
}

export interface UsersResult {
  users: UserListItem[]
  totalCount: number
  page: number
  pageSize: number
}

export interface UserOrderItem {
  id: string
  reference: string
  total: number
  status: string
  created_at: string
  items: OrderItem[]
}

export interface UserEnrollmentItem {
  id: string
  course_id: string
  enrolled_at: string
  course: Pick<Course, "id" | "title" | "slug" | "thumbnail_url" | "category"> | null
  progress: {
    completed_lessons: number
    is_completed: boolean
    last_accessed_at: string
  } | null
  total_lessons: number
}

export interface UserCartItem {
  id: string
  course_id: string
  added_at: string
  course: Pick<Course, "id" | "title" | "price" | "thumbnail_url"> | null
}

export interface UserDetail {
  pagination: { page: number; pageSize: number; totalCount: number }
  profile: {
    deleted_at: string | null
    auth_cleanup_completed_at: string | null
    auth_cleanup_attempts: number
    suspended_at: string | null
    id: string
    full_name: string
    email: string
    phone: string | null
    role: string
    avatar_url: string | null
    email_notifications: boolean
    last_login_at: string | null
    created_at: string
  }
  orders: UserOrderItem[]
  enrollments: UserEnrollmentItem[]
  cartItems: UserCartItem[]
}

export async function getUsers(filters?: {
  search?: string
  page?: number
}): Promise<UsersResult> {
  const admin = await verifyAdmin()
  if (!admin) return { users: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE }

  const supabase = createServiceRoleClient()
  const page = normalizePage(filters?.page)
  const from = (page - 1) * PAGE_SIZE

  const { data, error } = await supabase.rpc("search_users_with_email", {
    search_term: filters?.search?.trim().slice(0,120) || undefined,
    page_offset: from,
    page_limit: PAGE_SIZE,
  })

  if (error) {
    console.error("[admin.getUsers] rpc error:", error)
    throw new Error("No pudimos cargar los usuarios. Inténtalo de nuevo.")
  }

  const rows = data ?? []
  const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0

  const users: UserListItem[] = rows.map((r: {
    id: string
    full_name: string
    email: string
    phone: string | null
    role: string
    last_login_at: string | null
    created_at: string
    total_count: number
  }) => ({
    id: r.id,
    full_name: r.full_name,
    email: r.email ?? "",
    phone: r.phone,
    role: r.role,
    last_login_at: r.last_login_at,
    created_at: r.created_at,
  }))

  return { users, totalCount, page, pageSize: PAGE_SIZE }
}

export async function getUserDetail(userId: string, pageInput = 1): Promise<UserDetail | null> {
  const page = normalizePage(pageInput)
  const from = (page - 1) * PAGE_SIZE
  const admin = await verifyAdmin()
  if (!admin) return null

  const supabase = createServiceRoleClient()

  // 1. Profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, full_name, phone, role, avatar_url, email_notifications, last_login_at, created_at, suspended_at, deleted_at, auth_cleanup_completed_at, auth_cleanup_attempts"
    )
    .eq("id", userId)
    .single()

  if (profileError || !profile) {
    console.error("[admin.getUserDetail] profile not found:", userId, profileError)
    return null
  }

  // 2. Email from auth
  const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId)
  const email = authError ? "" : (authUser.user?.email ?? "")

  // 3. Orders with items
  const { data: ordersRaw, count: ordersCount } = await supabase
    .from("orders")
    .select("id, reference, total, status, created_at", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false }).order("id").range(from, from + PAGE_SIZE - 1)

  const orderIds = (ordersRaw ?? []).map((o) => o.id)
  const itemsByOrder: Record<string, OrderItem[]> = {}

  if (orderIds.length > 0) {
    const { data: itemsRaw } = await supabase
      .from("order_items")
      .select("*")
      .in("order_id", orderIds)

    for (const item of itemsRaw ?? []) {
      if (!itemsByOrder[item.order_id]) {
        itemsByOrder[item.order_id] = []
      }
      itemsByOrder[item.order_id].push(item as OrderItem)
    }
  }

  const orders: UserOrderItem[] = (ordersRaw ?? []).map((o) => ({
    id: o.id,
    reference: o.reference,
    total: o.total,
    status: o.status,
    created_at: o.created_at,
    items: itemsByOrder[o.id] ?? [],
  }))

  // 4. Enrollments with course info and progress
  const { data: enrollmentsRaw, count: enrollmentCount } = await supabase
    .from("enrollments")
    .select("id, course_id, enrolled_at", { count: "exact" })
    .eq("user_id", userId)
    .order("enrolled_at", { ascending: false }).order("id").range(from, from + PAGE_SIZE - 1)

  const courseIds = (enrollmentsRaw ?? []).map((e) => e.course_id)
  const coursesMap: Record<
    string,
    Pick<Course, "id" | "title" | "slug" | "thumbnail_url" | "category">
  > = {}
  const lessonCountMap: Record<string, number> = {}

  if (courseIds.length > 0) {
    const { data: coursesRaw } = await supabase
      .from("courses")
      .select("id, title, slug, thumbnail_url, category")
      .in("id", courseIds)

    for (const c of coursesRaw ?? []) {
      coursesMap[c.id] = c as Pick<
        Course,
        "id" | "title" | "slug" | "thumbnail_url" | "category"
      >
    }

  }

  // Course progress
  const progressMap: Record<
    string,
    { completed_lessons: number; is_completed: boolean; last_accessed_at: string }
  > = {}

  if (courseIds.length > 0) {
    const { data, error } = await supabase.rpc("admin_student_progress", { p_user_id: userId, p_course_ids: courseIds })
    if (error) throw new Error("No pudimos cargar el avance del estudiante.")
    for (const p of (data ?? []) as unknown as { course_id: string; total_lessons: number; completed_lessons: number; is_completed: boolean; last_accessed_at: string }[]) {
      progressMap[p.course_id] = p
      lessonCountMap[p.course_id] = p.total_lessons
    }
  }

  const enrollments: UserEnrollmentItem[] = (enrollmentsRaw ?? []).map((e) => ({
    id: e.id,
    course_id: e.course_id,
    enrolled_at: e.enrolled_at,
    course: coursesMap[e.course_id] ?? null,
    progress: progressMap[e.course_id] ?? null,
    total_lessons: lessonCountMap[e.course_id] ?? 0,
  }))

  // 5. Cart items
  const { data: cartRaw, count: cartCount } = await supabase
    .from("cart_items")
    .select("id, course_id, added_at", { count: "exact" })
    .eq("user_id", userId)
    .order("added_at", { ascending: false }).order("id").range(from, from + PAGE_SIZE - 1)

  const cartCourseIds = (cartRaw ?? []).map((c) => c.course_id)
  const cartCoursesMap: Record<
    string,
    Pick<Course, "id" | "title" | "price" | "thumbnail_url">
  > = {}

  if (cartCourseIds.length > 0) {
    const { data: cartCoursesRaw } = await supabase
      .from("courses")
      .select("id, title, price, thumbnail_url")
      .in("id", cartCourseIds)

    for (const c of cartCoursesRaw ?? []) {
      cartCoursesMap[c.id] = c as Pick<Course, "id" | "title" | "price" | "thumbnail_url">
    }
  }

  const cartItems: UserCartItem[] = (cartRaw ?? []).map((c) => ({
    id: c.id,
    course_id: c.course_id,
    added_at: c.added_at,
    course: cartCoursesMap[c.course_id] ?? null,
  }))

  return {
    pagination: { page, pageSize: PAGE_SIZE, totalCount: Math.max(ordersCount ?? 0, enrollmentCount ?? 0, cartCount ?? 0) },
    profile: {
      deleted_at: profile.deleted_at,
      auth_cleanup_completed_at: profile.auth_cleanup_completed_at,
      auth_cleanup_attempts: profile.auth_cleanup_attempts,
      suspended_at: profile.suspended_at,
      id: profile.id,
      full_name: profile.full_name,
      email,
      phone: profile.phone,
      role: profile.role,
      avatar_url: profile.avatar_url,
      email_notifications: profile.email_notifications,
      last_login_at: profile.last_login_at,
      created_at: profile.created_at,
    },
    orders,
    enrollments,
    cartItems,
  }
}
