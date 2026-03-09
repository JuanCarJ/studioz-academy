"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { recordAdminAuditLog } from "@/actions/admin/audit"

import type { DiscountRule } from "@/types"

async function verifyAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") {
    return null
  }
  return user
}

function parseComboFormData(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim()
  const categoryRaw = String(formData.get("category") ?? "").trim()
  const minCourses = Number(formData.get("minCourses") ?? 0)
  const discountType = String(formData.get("discountType") ?? "").trim()
  const discountValueRaw = Number(formData.get("discountValue") ?? 0)
  const isActive = formData.get("isActive") === "on"

  if (!name) {
    throw new Error("El nombre del combo es obligatorio.")
  }

  if (!["percentage", "fixed"].includes(discountType)) {
    throw new Error("Tipo de descuento invalido.")
  }

  if (!Number.isFinite(minCourses) || minCourses < 1) {
    throw new Error("La cantidad minima debe ser al menos 1.")
  }

  if (!Number.isFinite(discountValueRaw) || discountValueRaw <= 0) {
    throw new Error("El valor del descuento debe ser mayor a 0.")
  }

  const discountValue =
    discountType === "fixed"
      ? Math.round(discountValueRaw * 100)
      : Math.round(discountValueRaw)

  return {
    name,
    category:
      categoryRaw === "baile" || categoryRaw === "tatuaje" ? categoryRaw : null,
    min_courses: Math.round(minCourses),
    discount_type: discountType as "percentage" | "fixed",
    discount_value: Math.round(discountValue),
    is_active: isActive,
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

export async function createCombo(formData: FormData) {
  const admin = await verifyAdmin()
  if (!admin) throw new Error("No autorizado.")

  const supabase = await createServerClient()
  const payload = parseComboFormData(formData)

  const { data, error } = await supabase
    .from("discount_rules")
    .insert(payload)
    .select("*")
    .single()

  if (error) {
    throw new Error("No se pudo crear el combo.")
  }

  await recordAdminAuditLog({
    action: "combo.create",
    entityType: "discount_rule",
    entityId: data.id,
    afterData: data,
  })

  revalidatePath("/admin/combos")
}

export async function updateCombo(comboId: string, formData: FormData) {
  const admin = await verifyAdmin()
  if (!admin) throw new Error("No autorizado.")

  const supabase = await createServerClient()
  const payload = parseComboFormData(formData)

  const { data: before } = await supabase
    .from("discount_rules")
    .select("*")
    .eq("id", comboId)
    .single()

  const { data, error } = await supabase
    .from("discount_rules")
    .update(payload)
    .eq("id", comboId)
    .select("*")
    .single()

  if (error) {
    throw new Error("No se pudo actualizar el combo.")
  }

  await recordAdminAuditLog({
    action: "combo.update",
    entityType: "discount_rule",
    entityId: comboId,
    beforeData: before ?? null,
    afterData: data,
  })

  revalidatePath("/admin/combos")
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
