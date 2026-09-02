"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { createServerClient } from "@/lib/supabase/server"
import { enforceRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/security/rate-limit"

import type { Review } from "@/types"

export type ReviewWithUser = Review & {
  user: { id: string; full_name: string; avatar_url: string | null }
}

export interface ReviewActionResult {
  error?: string
  success?: boolean
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getCourseReviews(
  courseId: string
): Promise<ReviewWithUser[]> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from("reviews")
    .select("*, profiles(id, full_name, avatar_url)")
    .eq("course_id", courseId)
    .eq("is_visible", true)
    .order("created_at", { ascending: false })

  if (error || !data) return []

  return data.map((r) => ({
    ...r,
    user: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
  })) as ReviewWithUser[]
}

export async function getUserReviewForCourse(
  courseId: string
): Promise<Review | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle()

  if (error || !data) return null

  return data as Review
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createReview(
  courseId: string,
  formData: FormData
): Promise<ReviewActionResult> {
  const user = await getCurrentUser()
  if (!user) return { error: "Debes iniciar sesión para dejar una reseña." }
  if (!(await enforceRateLimit({ scope: "reviews:write", key: user.id, limit: 20, windowSeconds: 3600 })).allowed) {
    return { error: RATE_LIMIT_MESSAGE }
  }

  const ratingRaw = formData.get("rating")
  const textValue = formData.get("text")
  if (textValue !== null && typeof textValue !== "string") return { error: "Escribe un comentario válido." }
  const text = textValue || null

  const rating = Number(ratingRaw)
  if (!ratingRaw || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "La calificación debe ser un número entre 1 y 5." }
  }

  if (text && text.length > 500) {
    return { error: "El comentario no puede superar los 500 caracteres." }
  }

  const supabase = await createServerClient()

  // Shares the same eligibility rule as RLS, including the approved purchase.
  const { data: eligible, error: eligibilityError } = await supabase.rpc("can_review_course", {
    p_course_id: courseId,
  })
  if (eligibilityError || eligible !== true) {
    return { error: "Necesitas acceso vigente al curso para dejar una reseña." }
  }

  // One review per user per course (unique constraint enforced by DB too)
  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle()

  if (existing) {
    return { error: "Ya tienes una reseña para este curso. Puedes editarla." }
  }

  const { error } = await supabase.from("reviews").insert({
    user_id: user.id,
    course_id: courseId,
    rating,
    text: text?.trim() || null,
  })

  if (error) {
    return { error: "No se pudo guardar la reseña. Intenta de nuevo." }
  }

  revalidatePath(`/cursos/`)
  revalidatePath(`/dashboard/cursos/`)
  return { success: true }
}

export async function updateReview(
  reviewId: string,
  formData: FormData
): Promise<ReviewActionResult> {
  const user = await getCurrentUser()
  if (!user) return { error: "Debes iniciar sesión." }
  if (!(await enforceRateLimit({ scope: "reviews:write", key: user.id, limit: 20, windowSeconds: 3600 })).allowed) {
    return { error: RATE_LIMIT_MESSAGE }
  }

  const ratingRaw = formData.get("rating")
  const textValue = formData.get("text")
  if (textValue !== null && typeof textValue !== "string") return { error: "Escribe un comentario válido." }
  const text = textValue || null

  const rating = Number(ratingRaw)
  if (!ratingRaw || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "La calificación debe ser un número entre 1 y 5." }
  }

  if (text && text.length > 500) {
    return { error: "El comentario no puede superar los 500 caracteres." }
  }

  const supabase = await createServerClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from("reviews")
    .select("id, user_id, course_id")
    .eq("id", reviewId)
    .maybeSingle()

  if (!existing) return { error: "Reseña no encontrada." }
  if (existing.user_id !== user.id) return { error: "No autorizado." }

  const { data: eligible, error: eligibilityError } = await supabase.rpc("can_review_course", {
    p_course_id: existing.course_id,
  })
  if (eligibilityError || eligible !== true) {
    return { error: "Necesitas acceso vigente al curso para editar la reseña." }
  }

  const { error } = await supabase
    .from("reviews")
    .update({ rating, text: text?.trim() || null })
    .eq("id", reviewId)
    .eq("user_id", user.id)

  if (error) {
    return { error: "No se pudo actualizar la reseña. Intenta de nuevo." }
  }

  revalidatePath(`/cursos/`)
  revalidatePath(`/dashboard/cursos/`)
  return { success: true }
}

export async function deleteReview(
  reviewId: string
): Promise<ReviewActionResult> {
  const user = await getCurrentUser()
  if (!user) return { error: "Debes iniciar sesión." }
  if (!(await enforceRateLimit({ scope: "reviews:write", key: user.id, limit: 20, windowSeconds: 3600 })).allowed) {
    return { error: RATE_LIMIT_MESSAGE }
  }

  const supabase = await createServerClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from("reviews")
    .select("id, user_id")
    .eq("id", reviewId)
    .maybeSingle()

  if (!existing) return { error: "Reseña no encontrada." }
  if (existing.user_id !== user.id) return { error: "No autorizado." }

  const { error } = await supabase
    .from("reviews")
    .delete()
    .eq("id", reviewId)
    .eq("user_id", user.id)

  if (error) {
    return { error: "No se pudo eliminar la reseña. Intenta de nuevo." }
  }

  revalidatePath(`/cursos/`)
  revalidatePath(`/dashboard/cursos/`)
  return { success: true }
}
