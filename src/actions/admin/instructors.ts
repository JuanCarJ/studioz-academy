"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { slugify } from "@/lib/utils"

import type { Instructor } from "@/types"

const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"]

async function uploadInstructorAvatar(
  file: File,
  instructorId: string
): Promise<string | null> {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) return null
  if (file.size > MAX_AVATAR_SIZE) return null

  const ext = file.name.split(".").pop() ?? "jpg"
  const path = `instructors/${instructorId}/avatar.${ext}`

  const supabase = createServiceRoleClient()

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) return null

  const { data } = supabase.storage.from("avatars").getPublicUrl(path)

  return data.publicUrl
}

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

  const { data: instructor, error } = await supabase
    .from("instructors")
    .insert({
      full_name: fullName.trim(),
      slug: finalSlug,
      bio,
      specialties,
      years_experience: yearsExperience,
      is_active: true,
    })
    .select("id")
    .single()

  if (error) {
    return { error: "No se pudo crear el instructor. Intenta de nuevo." }
  }

  // Upload avatar if provided
  const avatarFile = formData.get("avatar") as File | null
  if (avatarFile && avatarFile.size > 0) {
    const avatarUrl = await uploadInstructorAvatar(avatarFile, instructor.id)
    if (avatarUrl) {
      await supabase
        .from("instructors")
        .update({ avatar_url: avatarUrl })
        .eq("id", instructor.id)
    }
  }

  revalidatePath("/admin/instructores")
  revalidatePath("/cursos")
  revalidatePath("/instructores")
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

  const updateData: Record<string, unknown> = {
    full_name: fullName.trim(),
    bio,
    specialties,
    years_experience: yearsExperience,
    is_active: isActive,
  }

  // Upload avatar if provided
  const avatarFile = formData.get("avatar") as File | null
  if (avatarFile && avatarFile.size > 0) {
    const avatarUrl = await uploadInstructorAvatar(avatarFile, instructorId)
    if (avatarUrl) {
      updateData.avatar_url = avatarUrl
    }
  }

  const { error } = await supabase
    .from("instructors")
    .update(updateData)
    .eq("id", instructorId)

  if (error) {
    return { error: "No se pudo actualizar el instructor." }
  }

  revalidatePath("/admin/instructores")
  revalidatePath("/cursos")
  revalidatePath("/instructores")
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
