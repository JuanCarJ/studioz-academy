"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { recordAdminAuditLog } from "@/actions/admin/audit"
import {
  COP_MAX_PESOS,
  getLengthError,
  normalizeWhitespace,
  parseCopInput,
  parseWholeNumberInput,
} from "@/lib/admin-form-utils"

import type { DiscountRule } from "@/types"

const COMBO_NAME_MAX_LENGTH = 80

export type ComboFieldName =
  | "name"
  | "minCourses"
  | "discountValue"
  | "buyQuantity"
  | "freeQuantity"

export interface ComboActionState {
  error?: string
  success?: boolean
  fieldErrors?: Partial<Record<ComboFieldName, string>>
}

async function verifyAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") {
    return null
  }
  return user
}

function buildComboFieldErrorState(
  fieldErrors: Partial<Record<ComboFieldName, string>>
): ComboActionState {
  return {
    error: "Corrige los campos marcados.",
    fieldErrors,
  }
}

function parseComboFormData(formData: FormData) {
  const name = normalizeWhitespace(String(formData.get("name") ?? ""))
  const categoryRaw = String(formData.get("category") ?? "").trim()
  const comboKind = String(formData.get("comboKind") ?? "").trim()
  const discountType = String(formData.get("discountType") ?? "").trim()
  const minCoursesRaw = String(formData.get("minCourses") ?? "")
  const discountValueRaw = String(formData.get("discountValue") ?? "")
  const buyQuantityRaw = String(formData.get("buyQuantity") ?? "")
  const freeQuantityRaw = String(formData.get("freeQuantity") ?? "")
  const isActive = formData.get("isActive") === "on"
  const fieldErrors: Partial<Record<ComboFieldName, string>> = {}

  const nameError = getLengthError({
    value: name,
    label: "El nombre del combo",
    required: true,
    max: COMBO_NAME_MAX_LENGTH,
  })
  if (nameError) {
    fieldErrors.name = nameError
  }

  if (!["threshold_discount", "buy_x_get_y"].includes(comboKind)) {
    return {
      fieldErrors: {
        ...fieldErrors,
        minCourses: "Selecciona un tipo de combo valido.",
      },
    }
  }

  const minCourses = parseWholeNumberInput(minCoursesRaw, {
    label: "La cantidad minima",
    min: 1,
    max: 999,
  })

  if (comboKind === "threshold_discount") {
    if (minCourses.error || minCourses.value === null) {
      fieldErrors.minCourses =
        minCourses.error ?? "La cantidad minima debe ser valida."
    } else if (minCourses.value < 2) {
      fieldErrors.minCourses = "Los combos por umbral requieren minimo 2 cursos."
    }

    if (!["percentage", "fixed"].includes(discountType)) {
      fieldErrors.discountValue = "Selecciona un tipo de descuento valido."
    } else if (discountType === "percentage") {
      const discountValue = parseWholeNumberInput(discountValueRaw, {
        label: "El descuento porcentual",
        required: true,
        min: 1,
        max: 100,
      })

      if (discountValue.error || discountValue.value === null) {
        fieldErrors.discountValue =
          discountValue.error ?? "Ingresa un descuento porcentual valido."
      }

      if (Object.keys(fieldErrors).length > 0) {
        return { fieldErrors }
      }

      return {
        fieldErrors,
        payload: {
          name,
          category:
            categoryRaw === "baile" || categoryRaw === "tatuaje" ? categoryRaw : null,
          combo_kind: "threshold_discount" as const,
          min_courses: minCourses.value!,
          discount_type: "percentage" as const,
          discount_value: discountValue.value!,
          buy_quantity: null,
          free_quantity: null,
          is_active: isActive,
        },
      }
    }

    const discountValue = parseCopInput(discountValueRaw, {
      label: "El descuento fijo",
      required: true,
      minPesos: 1,
      maxPesos: COP_MAX_PESOS,
    })

    if (discountValue.error || discountValue.pesos === null) {
      fieldErrors.discountValue =
        discountValue.error ?? "Ingresa un descuento fijo valido."
    }

    if (Object.keys(fieldErrors).length > 0) {
      return { fieldErrors }
    }

    return {
      fieldErrors,
        payload: {
          name,
          category:
            categoryRaw === "baile" || categoryRaw === "tatuaje" ? categoryRaw : null,
          combo_kind: "threshold_discount" as const,
          min_courses: minCourses.value!,
          discount_type: "fixed" as const,
          discount_value: discountValue.pesos! * 100,
          buy_quantity: null,
          free_quantity: null,
          is_active: isActive,
        },
      }
  }

  const buyQuantity = parseWholeNumberInput(buyQuantityRaw, {
    label: "La cantidad a llevar",
    min: 1,
    max: 999,
  })
  if (buyQuantity.error || buyQuantity.value === null) {
    fieldErrors.buyQuantity =
      buyQuantity.error ?? "La cantidad a llevar debe ser valida."
  }

  const freeQuantity = parseWholeNumberInput(freeQuantityRaw, {
    label: "La cantidad gratis",
    min: 1,
    max: 999,
  })
  if (freeQuantity.error || freeQuantity.value === null) {
    fieldErrors.freeQuantity =
      freeQuantity.error ?? "La cantidad gratis debe ser valida."
  }

  if (
    buyQuantity.value !== null &&
    freeQuantity.value !== null &&
    buyQuantity.value + freeQuantity.value < 2
  ) {
    fieldErrors.freeQuantity = "El combo gratis debe involucrar al menos 2 cursos."
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors }
  }

  return {
    fieldErrors,
    payload: {
      name,
      category:
        categoryRaw === "baile" || categoryRaw === "tatuaje" ? categoryRaw : null,
      combo_kind: "buy_x_get_y" as const,
      min_courses: buyQuantity.value! + freeQuantity.value!,
      discount_type: null,
      discount_value: null,
      buy_quantity: buyQuantity.value!,
      free_quantity: freeQuantity.value!,
      is_active: isActive,
    },
  }
}

export async function getDiscountRules(): Promise<DiscountRule[]> {
  const admin = await verifyAdmin()
  if (!admin) return []

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("discount_rules")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[admin.combos] Failed to load combos:", error)
    return []
  }

  return (data ?? []) as DiscountRule[]
}

export async function createCombo(
  _prevState: ComboActionState,
  formData: FormData
): Promise<ComboActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const supabase = await createServerClient()
  const parsed = parseComboFormData(formData)
  if (!parsed.payload) {
    return buildComboFieldErrorState(parsed.fieldErrors)
  }

  const { data, error } = await supabase
    .from("discount_rules")
    .insert(parsed.payload)
    .select("*")
    .single()

  if (error) {
    return { error: "No se pudo crear el combo. Intenta de nuevo." }
  }

  await recordAdminAuditLog({
    action: "combo.create",
    entityType: "discount_rule",
    entityId: data.id,
    afterData: data,
  })

  revalidatePath("/admin/combos")
  return { success: true }
}

export async function updateCombo(
  comboId: string,
  _prevState: ComboActionState,
  formData: FormData
): Promise<ComboActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const supabase = await createServerClient()
  const parsed = parseComboFormData(formData)
  if (!parsed.payload) {
    return buildComboFieldErrorState(parsed.fieldErrors)
  }

  const { data: before } = await supabase
    .from("discount_rules")
    .select("*")
    .eq("id", comboId)
    .single()

  const { data, error } = await supabase
    .from("discount_rules")
    .update(parsed.payload)
    .eq("id", comboId)
    .select("*")
    .single()

  if (error) {
    return { error: "No se pudo actualizar el combo. Intenta de nuevo." }
  }

  await recordAdminAuditLog({
    action: "combo.update",
    entityType: "discount_rule",
    entityId: comboId,
    beforeData: before ?? null,
    afterData: data,
  })

  revalidatePath("/admin/combos")
  return { success: true }
}

export async function deleteCombo(comboId: string) {
  const admin = await verifyAdmin()
  if (!admin) throw new Error("No autorizado.")

  const supabase = await createServerClient()
  const { data: before } = await supabase
    .from("discount_rules")
    .select("*")
    .eq("id", comboId)
    .single()

  const { error } = await supabase
    .from("discount_rules")
    .delete()
    .eq("id", comboId)

  if (error) {
    throw new Error("No se pudo eliminar el combo.")
  }

  await recordAdminAuditLog({
    action: "combo.delete",
    entityType: "discount_rule",
    entityId: comboId,
    beforeData: before ?? null,
  })

  revalidatePath("/admin/combos")
}
