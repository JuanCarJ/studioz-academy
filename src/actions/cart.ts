"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import {
  addCourseToCartForUser,
  getCartItemsForUser,
  resolveCartStateForUser,
} from "@/lib/cart"

export type { CartItemWithCourse } from "@/lib/cart"
export type { AddCourseToCartErrorCode } from "@/lib/cart"

export interface CartActionResult {
  error?: string
  success?: boolean
}

export interface CartStateResult {
  items: Awaited<ReturnType<typeof getCartItemsForUser>>
  subtotal: number
  discountAmount: number
  discountName: string | null
  total: number
}

export async function addToCart(
  courseId: string
): Promise<CartActionResult> {
  const user = await getCurrentUser()
  if (!user) return { error: "AUTH_REQUIRED" }

  const supabase = await createServerClient()
  const result = await addCourseToCartForUser({
    supabase,
    userId: user.id,
    courseId,
  })

  if (!result.success) {
    return {
      error: result.code === "ADD_FAILED" ? "No se pudo agregar al carrito." : result.code,
    }
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

export async function getCart() {
  const user = await getCurrentUser()
  if (!user) return []

  const supabase = await createServerClient()
  return getCartItemsForUser({
    supabase,
    userId: user.id,
  })
}

export async function getCartState(): Promise<CartStateResult> {
  const user = await getCurrentUser()
  if (!user) {
    return {
      items: [],
      subtotal: 0,
      discountAmount: 0,
      discountName: null,
      total: 0,
    }
  }

  const supabase = await createServerClient()
  const state = await resolveCartStateForUser({
    supabase,
    userId: user.id,
  })

  return {
    items: state.items,
    subtotal: state.subtotal,
    discountAmount: state.discountAmount,
    discountName: state.discountRule?.name ?? null,
    total: state.total,
  }
}

export async function getCartCount(): Promise<number> {
  const user = await getCurrentUser()
  if (!user) return 0

  const supabase = await createServerClient()
  const items = await getCartItemsForUser({
    supabase,
    userId: user.id,
  })

  return items.length
}
