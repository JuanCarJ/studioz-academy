"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { decodeAdminPage, normalizeReviewFilters } from "@/lib/admin-review-audit"
import { UUID_PATTERN } from "@/lib/admin-operations"

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

export async function listAllReviews(query: Record<string, string | string[] | undefined> = {}) {
  const admin = await verifyAdmin()
  if (!admin) throw new Error("admin_required")
  const filters = normalizeReviewFilters(query)
  const { data, error } = await createServiceRoleClient().rpc("admin_reviews_page", {
    p_search: filters.search, p_course: filters.course, p_visibility: filters.visibility,
    p_rating: filters.rating, p_page: filters.page,
  })
  if (error) throw new Error("reviews_unavailable")
  return decodeAdminPage<AdminReview>(data)
}

// ── Mutations ─────────────────────────────────────────────────────────────────

async function applyModeration(reviewId: string, operation: "show" | "hide" | "delete") {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }
  if (!UUID_PATTERN.test(reviewId)) return { error: "Reseña no encontrada." }
  const { data, error } = await createServiceRoleClient().rpc("moderate_review_audited", {
    p_admin_id: admin.id, p_review_id: reviewId, p_operation: operation,
  })
  if (error) return { error: "No se pudo guardar el cambio. Inténtalo de nuevo." }
  revalidatePath("/admin/resenas")
  revalidatePath("/admin/auditoria")
  const result = data as { course_slug?: string } | null
  if (result?.course_slug) {
    revalidatePath(`/cursos/${result.course_slug}`)
    revalidatePath(`/dashboard/cursos/${result.course_slug}`)
  }
  return { success: true }
}

export async function moderateReview(reviewId: string, isVisible: boolean) {
  if (typeof isVisible !== "boolean") return { error: "Elige si la reseña debe mostrarse." }
  return applyModeration(reviewId, isVisible ? "show" : "hide")
}

export async function deleteReviewAdmin(
  reviewId: string
): Promise<{ error?: string; success?: boolean }> {
  return applyModeration(reviewId, "delete")
}
