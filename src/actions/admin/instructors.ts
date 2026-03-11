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
  INSTRUCTOR_SPECIALTIES_MAX_ITEMS,
  buildInstructorSpecialtyValue,
  getLengthError,
  getSpecialtyNameError,
  isInstructorSpecialtyCategory,
  normalizeOptionalText,
  normalizeSpecialtyKey,
  normalizeSpecialtyName,
  normalizeWhitespace,
  parseInstructorSpecialtyValue,
  validateImageFile,
} from "@/lib/admin-form-utils"

import type {
  Instructor,
  InstructorSpecialtyCategory,
  InstructorSpecialtyOption,
} from "@/types"

const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"]

type InstructorSpecialtyDraft = Pick<
  InstructorSpecialtyOption,
  "name" | "normalized_name" | "category"
>

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
    Record<
      | "fullName"
      | "bio"
      | "specialties"
      | "newSpecialtyName"
      | "newSpecialtyCategory"
      | "avatar",
      string
    >
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

function getSpecialtyMapKey(
  category: InstructorSpecialtyCategory,
  normalizedName: string
) {
  return buildInstructorSpecialtyValue(category, normalizedName)
}

function dedupeSpecialties(items: InstructorSpecialtyDraft[]) {
  const map = new Map<string, InstructorSpecialtyDraft>()

  for (const item of items) {
    map.set(getSpecialtyMapKey(item.category, item.normalized_name), item)
  }

  return [...map.values()]
}

function validateInstructorFormData(
  formData: FormData,
  specialtyOptions: InstructorSpecialtyOption[]
) {
  const fullName = normalizeWhitespace(String(formData.get("fullName") ?? ""))
  const bio = normalizeOptionalText(String(formData.get("bio") ?? ""))
  const selectedSpecialtyValues = formData
    .getAll("specialties")
    .map((value) => String(value))
  const newSpecialtyNameRaw = String(formData.get("newSpecialtyName") ?? "")
  const newSpecialtyCategoryRaw = String(
    formData.get("newSpecialtyCategory") ?? ""
  ).trim()
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

  const selectedSpecialties: InstructorSpecialtyDraft[] = []
  let selectedSpecialtiesInvalid = false

  for (const selectedValue of selectedSpecialtyValues) {
    const parsedValue = parseInstructorSpecialtyValue(selectedValue)

    if (!parsedValue) {
      selectedSpecialtiesInvalid = true
      continue
    }

    const matchedOption = specialtyOptions.find(
      (option) =>
        option.category === parsedValue.category &&
        option.normalized_name === parsedValue.normalizedName
    )

    if (!matchedOption) {
      selectedSpecialtiesInvalid = true
      continue
    }

    selectedSpecialties.push(matchedOption)
  }

  if (selectedSpecialtiesInvalid) {
    fieldErrors.specialties = "Selecciona solo especialidades disponibles."
  }

  const normalizedNewSpecialtyName = normalizeSpecialtyName(newSpecialtyNameRaw)
  const normalizedNewSpecialtyKey = normalizeSpecialtyKey(newSpecialtyNameRaw)

  let newSpecialtyDraft: InstructorSpecialtyDraft | null = null

  if (newSpecialtyNameRaw.trim()) {
    const specialtyNameError = getSpecialtyNameError(normalizedNewSpecialtyName)
    if (specialtyNameError) {
      fieldErrors.newSpecialtyName = specialtyNameError
    }

    if (!isInstructorSpecialtyCategory(newSpecialtyCategoryRaw)) {
      fieldErrors.newSpecialtyCategory =
        "Selecciona la categoria de la nueva especialidad."
    } else if (!specialtyNameError) {
      const existingOption = specialtyOptions.find(
        (option) =>
          option.category === newSpecialtyCategoryRaw &&
          option.normalized_name === normalizedNewSpecialtyKey
      )

      newSpecialtyDraft = existingOption ?? {
        name: normalizedNewSpecialtyName,
        normalized_name: normalizedNewSpecialtyKey,
        category: newSpecialtyCategoryRaw,
      }
    }
  }

  const specialties = dedupeSpecialties(
    newSpecialtyDraft
      ? [...selectedSpecialties, newSpecialtyDraft]
      : selectedSpecialties
  )

  if (specialties.length > INSTRUCTOR_SPECIALTIES_MAX_ITEMS) {
    fieldErrors.specialties = `Puedes seleccionar hasta ${INSTRUCTOR_SPECIALTIES_MAX_ITEMS} especialidades.`
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
      specialties,
      newSpecialtyDraft:
        newSpecialtyDraft &&
        !specialtyOptions.some(
          (option) =>
            option.category === newSpecialtyDraft.category &&
            option.normalized_name === newSpecialtyDraft.normalized_name
        )
          ? newSpecialtyDraft
          : null,
      avatarFile,
    },
  }
}

async function upsertSpecialtyOption(
  specialty: InstructorSpecialtyDraft
): Promise<InstructorSpecialtyOption | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("instructor_specialty_options")
    .upsert(specialty, { onConflict: "category,normalized_name" })
    .select("*")
    .single()

  if (error || !data) {
    return null
  }

  return data as InstructorSpecialtyOption
}

async function persistSpecialties(
  specialties: InstructorSpecialtyDraft[],
  newSpecialtyDraft: InstructorSpecialtyDraft | null
) {
  if (!newSpecialtyDraft) {
    return specialties.map((specialty) => specialty.name)
  }

  const upsertedSpecialty = await upsertSpecialtyOption(newSpecialtyDraft)
  if (!upsertedSpecialty) {
    return null
  }

  return specialties.map((specialty) =>
    specialty.category === upsertedSpecialty.category &&
    specialty.normalized_name === upsertedSpecialty.normalized_name
      ? upsertedSpecialty.name
      : specialty.name
  )
}

export async function createInstructor(
  _prevState: InstructorActionState,
  formData: FormData
): Promise<InstructorActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const supabase = await createServerClient()
  const specialtyOptions = await getInstructorSpecialtyOptions(supabase)
  const validation = validateInstructorFormData(formData, specialtyOptions)
  if (Object.keys(validation.fieldErrors).length > 0) {
    return buildInstructorFieldErrorState(validation.fieldErrors)
  }

  const { fullName, bio, specialties, newSpecialtyDraft, avatarFile } =
    validation.values
  const specialtyNames = await persistSpecialties(specialties, newSpecialtyDraft)

  if (!specialtyNames) {
    return {
      error: "No se pudo guardar la nueva especialidad. Intenta de nuevo.",
    }
  }

  const slug = slugify(fullName)

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
      specialties: specialtyNames,
      is_active: true,
    })
    .select("id")
    .single()

  if (error) {
    return { error: "No se pudo crear el instructor. Intenta de nuevo." }
  }

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

  const supabase = await createServerClient()
  const specialtyOptions = await getInstructorSpecialtyOptions(supabase)
  const validation = validateInstructorFormData(formData, specialtyOptions)
  if (Object.keys(validation.fieldErrors).length > 0) {
    return buildInstructorFieldErrorState(validation.fieldErrors)
  }

  const { fullName, bio, specialties, newSpecialtyDraft, avatarFile } =
    validation.values
  const isActive = formData.get("isActive") === "on"
  const specialtyNames = await persistSpecialties(specialties, newSpecialtyDraft)

  if (!specialtyNames) {
    return {
      error: "No se pudo guardar la nueva especialidad. Intenta de nuevo.",
    }
  }

  const updateData: Record<string, unknown> = {
    full_name: fullName.trim(),
    bio,
    specialties: specialtyNames,
    is_active: isActive,
  }

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

export async function getInstructorSpecialtyOptions(
  client?: Awaited<ReturnType<typeof createServerClient>>
): Promise<InstructorSpecialtyOption[]> {
  const supabase = client ?? (await createServerClient())

  const { data, error } = await supabase
    .from("instructor_specialty_options")
    .select("*")
    .order("category")
    .order("name")

  if (error) return []
  return (data ?? []) as InstructorSpecialtyOption[]
}
