"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { createServerClient } from "@/lib/supabase/server"

import type { Review } from "@/types"

export type AdminReview = Review & {
  user: { id: string; full_name: string } | null
  course: { id: string; title: string; slug: string } | null
}

async function verifyAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") return null
  return user
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listAllReviews(filters?: {
  courseId?: string
}): Promise<AdminReview[]> {
  const admin = await verifyAdmin()
  if (!admin) return []

  const supabase = await createServerClient()

  let query = supabase
    .from("reviews")
    .select(
      "*, profiles(id, full_name), courses(id, title, slug)"
    )
    .order("created_at", { ascending: false })

  if (filters?.courseId) {
    query = query.eq("course_id", filters.courseId)
  }

  const { data, error } = await query

  if (error || !data) return []

  return data.map((r) => ({
    ...r,
    user: Array.isArray(r.profiles)
      ? (r.profiles[0] ?? null)
      : (r.profiles ?? null),
    course: Array.isArray(r.courses)
      ? (r.courses[0] ?? null)
      : (r.courses ?? null),
  })) as AdminReview[]
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function moderateReview(
  reviewId: string,
  isVisible: boolean
): Promise<{ error?: string; success?: boolean }> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const supabase = await createServerClient()

  const { error } = await supabase
    .from("reviews")
    .update({ is_visible: isVisible })
    .eq("id", reviewId)

  if (error) return { error: "No se pudo actualizar la visibilidad." }

  revalidatePath("/admin/resenas")
  return { success: true }
}

export async function deleteReviewAdmin(
  reviewId: string
): Promise<{ error?: string; success?: boolean }> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  // Use service role for hard delete to bypass any RLS restrictions
  const adminClient = createServiceRoleClient()

  const { error } = await adminClient
    .from("reviews")
    .delete()
    .eq("id", reviewId)

  if (error) return { error: "No se pudo eliminar la resena." }

  revalidatePath("/admin/resenas")
  return { success: true }
}
