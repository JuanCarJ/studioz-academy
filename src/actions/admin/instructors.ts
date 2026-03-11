"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { slugify } from "@/lib/utils"
import {
  INSTRUCTOR_BIO_MAX_LENGTH,
  INSTRUCTOR_FULL_NAME_MAX_LENGTH,
  INSTRUCTOR_FULL_NAME_MIN_LENGTH,
  INSTRUCTOR_YEARS_EXPERIENCE_MAX,
  getLengthError,
  normalizeOptionalText,
  normalizeWhitespace,
  parseSpecialtiesInput,
  parseWholeNumberInput,
  validateImageFile,
} from "@/lib/admin-form-utils"

import type { Instructor } from "@/types"

const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"]

async function uploadInstructorAvatar(
  file: File,
  instructorId: string
): Promise<string | null> {
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
  fieldErrors?: Partial<
    Record<"fullName" | "bio" | "specialties" | "yearsExperience" | "avatar", string>
  >
}

async function verifyAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") {
    return null
  }
  return user
}

function buildInstructorFieldErrorState(
  fieldErrors: NonNullable<InstructorActionState["fieldErrors"]>
): InstructorActionState {
  return {
    error: "Corrige los campos marcados.",
    fieldErrors,
  }
}

function validateInstructorFormData(formData: FormData) {
  const fullName = normalizeWhitespace(String(formData.get("fullName") ?? ""))
  const bio = normalizeOptionalText(String(formData.get("bio") ?? ""))
  const specialtiesRaw = String(formData.get("specialties") ?? "")
  const yearsExperienceRaw = String(formData.get("yearsExperience") ?? "")
  const avatarCandidate = formData.get("avatar")
  const avatarFile =
    avatarCandidate instanceof File && avatarCandidate.size > 0
      ? avatarCandidate
      : null
  const fieldErrors: NonNullable<InstructorActionState["fieldErrors"]> = {}

  const fullNameError = getLengthError({
    value: fullName,
    label: "El nombre",
    required: true,
    min: INSTRUCTOR_FULL_NAME_MIN_LENGTH,
    max: INSTRUCTOR_FULL_NAME_MAX_LENGTH,
  })
  if (fullNameError) {
    fieldErrors.fullName = fullNameError
  }

  if (bio) {
    const bioError = getLengthError({
      value: bio,
      label: "La bio",
      max: INSTRUCTOR_BIO_MAX_LENGTH,
    })
    if (bioError) {
      fieldErrors.bio = bioError
    }
  }

  const parsedSpecialties = parseSpecialtiesInput(specialtiesRaw)
  if (parsedSpecialties.error) {
    fieldErrors.specialties = parsedSpecialties.error
  }

  const parsedYearsExperience = parseWholeNumberInput(yearsExperienceRaw, {
    label: "Los anos de experiencia",
    min: 0,
    max: INSTRUCTOR_YEARS_EXPERIENCE_MAX,
  })
  if (parsedYearsExperience.error) {
    fieldErrors.yearsExperience = parsedYearsExperience.error
  }

  const avatarError = validateImageFile(avatarFile, {
    label: "La foto",
    allowedTypes: ALLOWED_AVATAR_TYPES,
    maxSizeBytes: MAX_AVATAR_SIZE,
  })
  if (avatarError) {
    fieldErrors.avatar = avatarError
  }

  return {
    fieldErrors,
    values: {
      fullName,
      bio,
      specialties: parsedSpecialties.items,
      yearsExperience: parsedYearsExperience.value,
      avatarFile,
    },
  }
}

export async function createInstructor(
  _prevState: InstructorActionState,
  formData: FormData
): Promise<InstructorActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const validation = validateInstructorFormData(formData)
  if (Object.keys(validation.fieldErrors).length > 0) {
    return buildInstructorFieldErrorState(validation.fieldErrors)
  }

  const { fullName, bio, specialties, yearsExperience, avatarFile } =
    validation.values
  const slug = slugify(fullName)

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
  if (avatarFile) {
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

  const validation = validateInstructorFormData(formData)
  if (Object.keys(validation.fieldErrors).length > 0) {
    return buildInstructorFieldErrorState(validation.fieldErrors)
  }

  const { fullName, bio, specialties, yearsExperience, avatarFile } =
    validation.values
  const isActive = formData.get("isActive") === "on"

  const supabase = await createServerClient()

  const updateData: Record<string, unknown> = {
    full_name: fullName.trim(),
    bio,
    specialties,
    years_experience: yearsExperience,
    is_active: isActive,
  }

  // Upload avatar if provided
  if (avatarFile) {
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
