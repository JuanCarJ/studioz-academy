"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"

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
  const supabase = await createServerClient()

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
  if (!user) return { error: "Debes iniciar sesion para dejar una resena." }

  const ratingRaw = formData.get("rating")
  const text = (formData.get("text") as string | null) || null

  const rating = Number(ratingRaw)
  if (!ratingRaw || isNaN(rating) || rating < 1 || rating > 5) {
    return { error: "La calificacion debe ser un numero entre 1 y 5." }
  }

  if (text && text.length > 500) {
    return { error: "El comentario no puede superar los 500 caracteres." }
  }

  const supabase = await createServerClient()

  // Must be enrolled
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle()

  if (!enrollment) {
    return { error: "Debes estar inscrito en el curso para dejar una resena." }
  }

  // One review per user per course (unique constraint enforced by DB too)
  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle()

  if (existing) {
    return { error: "Ya tienes una resena para este curso. Puedes editarla." }
  }

  const { error } = await supabase.from("reviews").insert({
    user_id: user.id,
    course_id: courseId,
    rating,
    text: text?.trim() || null,
  })

  if (error) {
    return { error: "No se pudo guardar la resena. Intenta de nuevo." }
  }

  revalidatePath(`/cursos/`)
  return { success: true }
}

export async function updateReview(
  reviewId: string,
  formData: FormData
): Promise<ReviewActionResult> {
  const user = await getCurrentUser()
  if (!user) return { error: "Debes iniciar sesion." }

  const ratingRaw = formData.get("rating")
  const text = (formData.get("text") as string | null) || null

  const rating = Number(ratingRaw)
  if (!ratingRaw || isNaN(rating) || rating < 1 || rating > 5) {
    return { error: "La calificacion debe ser un numero entre 1 y 5." }
  }

  if (text && text.length > 500) {
    return { error: "El comentario no puede superar los 500 caracteres." }
  }

  const supabase = await createServerClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from("reviews")
    .select("id, user_id")
    .eq("id", reviewId)
    .maybeSingle()

  if (!existing) return { error: "Resena no encontrada." }
  if (existing.user_id !== user.id) return { error: "No autorizado." }

  const { error } = await supabase
    .from("reviews")
    .update({ rating, text: text?.trim() || null })
    .eq("id", reviewId)

  if (error) {
    return { error: "No se pudo actualizar la resena. Intenta de nuevo." }
  }

  revalidatePath(`/cursos/`)
  return { success: true }
}

export async function deleteReview(
  reviewId: string
): Promise<ReviewActionResult> {
  const user = await getCurrentUser()
  if (!user) return { error: "Debes iniciar sesion." }

  const supabase = await createServerClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from("reviews")
    .select("id, user_id")
    .eq("id", reviewId)
    .maybeSingle()

  if (!existing) return { error: "Resena no encontrada." }
  if (existing.user_id !== user.id) return { error: "No autorizado." }

  const { error } = await supabase
    .from("reviews")
    .delete()
    .eq("id", reviewId)

  if (error) {
    return { error: "No se pudo eliminar la resena. Intenta de nuevo." }
  }

  revalidatePath(`/cursos/`)
  return { success: true }
}
