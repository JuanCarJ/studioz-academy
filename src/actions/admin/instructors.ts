"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { slugify } from "@/lib/utils"

import type { Instructor } from "@/types"

export interface InstructorActionState {
  error?: string
  success?: boolean
}

async function verifyAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") {
    return null
  }
  return user
}

export async function createInstructor(
  _prevState: InstructorActionState,
  formData: FormData
): Promise<InstructorActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const fullName = formData.get("fullName") as string
  const bio = (formData.get("bio") as string) || null
  const specialtiesRaw = (formData.get("specialties") as string) || ""
  const yearsExperience = formData.get("yearsExperience")
    ? Number(formData.get("yearsExperience"))
    : null

  if (!fullName?.trim()) {
    return { error: "El nombre es obligatorio." }
  }

  const slug = slugify(fullName)
  const specialties = specialtiesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const supabase = await createServerClient()

  // Ensure unique slug
  const { data: existing } = await supabase
    .from("instructors")
    .select("id")
    .eq("slug", slug)
    .maybeSingle()

  const finalSlug = existing ? `${slug}-${Date.now().toString(36)}` : slug

  const { error } = await supabase.from("instructors").insert({
    full_name: fullName.trim(),
    slug: finalSlug,
    bio,
    specialties,
    years_experience: yearsExperience,
    is_active: true,
  })

  if (error) {
    return { error: "No se pudo crear el instructor. Intenta de nuevo." }
  }

  revalidatePath("/admin/instructores")
  return { success: true }
}

export async function updateInstructor(
  instructorId: string,
  _prevState: InstructorActionState,
  formData: FormData
): Promise<InstructorActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const fullName = formData.get("fullName") as string
  const bio = (formData.get("bio") as string) || null
  const specialtiesRaw = (formData.get("specialties") as string) || ""
  const yearsExperience = formData.get("yearsExperience")
    ? Number(formData.get("yearsExperience"))
    : null
  const isActive = formData.get("isActive") === "on"

  if (!fullName?.trim()) {
    return { error: "El nombre es obligatorio." }
  }

  const specialties = specialtiesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const supabase = await createServerClient()

  const { error } = await supabase
    .from("instructors")
    .update({
      full_name: fullName.trim(),
      bio,
      specialties,
      years_experience: yearsExperience,
      is_active: isActive,
    })
    .eq("id", instructorId)

  if (error) {
    return { error: "No se pudo actualizar el instructor." }
  }

  revalidatePath("/admin/instructores")
  return { success: true }
}

export async function getInstructors(): Promise<Instructor[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("instructors")
    .select("*")
    .order("full_name")

  if (error) return []
  return (data ?? []) as Instructor[]
}
