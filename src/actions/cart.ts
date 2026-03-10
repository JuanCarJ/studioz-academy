"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import {
  addCourseToCartForUser,
  getCartItemsForUser,
  resolveCartStateForUser,
} from "@/lib/cart"
import type { PricingLine } from "@/types"

export type { CartItemWithCourse } from "@/lib/cart"
export type { AddCourseToCartErrorCode } from "@/lib/cart"

export interface CartActionResult {
  error?: string
  success?: boolean
}

export interface CartStateResult {
  items: Awaited<ReturnType<typeof getCartItemsForUser>>
  listSubtotal: number
  subtotal: number
  courseDiscountAmount: number
  comboDiscountAmount: number
  discountAmount: number
  discountName: string | null
  appliedDiscountLines: PricingLine[]
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
      listSubtotal: 0,
      subtotal: 0,
      courseDiscountAmount: 0,
      comboDiscountAmount: 0,
      discountAmount: 0,
      discountName: null,
      appliedDiscountLines: [],
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
    listSubtotal: state.listSubtotal,
    subtotal: state.subtotal,
    courseDiscountAmount: state.courseDiscountAmount,
    comboDiscountAmount: state.comboDiscountAmount,
    discountAmount: state.discountAmount,
    discountName: state.primaryComboRuleName,
    appliedDiscountLines: state.appliedDiscountLines,
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
