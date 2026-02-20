"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"

import type { Course, Instructor } from "@/types"

export interface CartActionResult {
  error?: string
  success?: boolean
}

export interface CartItemWithCourse {
  id: string
  user_id: string
  course_id: string
  added_at: string
  course: Course & { instructor: Pick<Instructor, "id" | "full_name"> }
}

export async function addToCart(
  courseId: string
): Promise<CartActionResult> {
  const user = await getCurrentUser()
  if (!user) return { error: "AUTH_REQUIRED" }

  const supabase = await createServerClient()

  // Check enrollment
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle()

  if (enrollment) return { error: "ALREADY_ENROLLED" }

  // Check already in cart (UNIQUE constraint)
  const { data: existing } = await supabase
    .from("cart_items")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle()

  if (existing) return { error: "ALREADY_IN_CART" }

  const { error } = await supabase.from("cart_items").insert({
    user_id: user.id,
    course_id: courseId,
  })

  if (error) {
    return { error: "No se pudo agregar al carrito." }
  }

  revalidatePath("/carrito")
  revalidatePath("/", "layout")
  return { success: true }
}

export async function removeFromCart(
  cartItemId: string
): Promise<CartActionResult> {
  const user = await getCurrentUser()
  if (!user) return { error: "AUTH_REQUIRED" }

  const supabase = await createServerClient()

  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("id", cartItemId)
    .eq("user_id", user.id)

  if (error) {
    return { error: "No se pudo eliminar del carrito." }
  }

  revalidatePath("/carrito")
  revalidatePath("/", "layout")
  return { success: true }
}

export async function getCart(): Promise<CartItemWithCourse[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("cart_items")
    .select("*, courses(*, instructors(id, full_name))")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false })

  if (error || !data) return []

  // Split items: published vs unpublished
  const validItems: typeof data = []
  const invalidItemIds: string[] = []

  for (const item of data) {
    const course = Array.isArray(item.courses) ? item.courses[0] : item.courses
    if (course?.is_published) {
      validItems.push(item)
    } else {
      invalidItemIds.push(item.id)
    }
  }

  // H-08: Proactively delete items with unpublished courses from DB
  if (invalidItemIds.length > 0) {
    await supabase.from("cart_items").delete().in("id", invalidItemIds)
  }

  return validItems.map((item) => {
    const rawCourse = Array.isArray(item.courses)
      ? item.courses[0]
      : item.courses
    const instructor = Array.isArray(rawCourse.instructors)
      ? rawCourse.instructors[0]
      : rawCourse.instructors
    return {
      id: item.id,
      user_id: item.user_id,
      course_id: item.course_id,
      added_at: item.added_at,
      course: {
        ...rawCourse,
        instructor,
      },
    }
  }) as CartItemWithCourse[]
}

export async function getCartCount(): Promise<number> {
  const user = await getCurrentUser()
  if (!user) return 0

  const supabase = await createServerClient()

  // H-08: Use inner join to only count items with published courses
  const { count, error } = await supabase
    .from("cart_items")
    .select("id, courses!inner(is_published)", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("courses.is_published", true)

  if (error) return 0
  return count ?? 0
}
