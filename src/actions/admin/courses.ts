"use server"
import type { TablesUpdate } from "@/types/database"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import {
  createBunnyTusUploadSession,
  createBunnyVideo,
  deleteBunnyVideo,
  isManagedBunnyVideoId,
  updateBunnyMediaSnapshot,
} from "@/lib/bunny"
import { env } from "@/lib/env"
import { decorateCourseWithPricing, type PriceableCourse } from "@/lib/pricing"
import { slugify } from "@/lib/utils"
import {
  COP_MAX_PESOS,
  COURSE_DESCRIPTION_MAX_LENGTH,
  COURSE_SHORT_DESCRIPTION_MAX_LENGTH,
  COURSE_SHORT_DESCRIPTION_MIN_LENGTH,
  COURSE_TITLE_MAX_LENGTH,
  COURSE_TITLE_MIN_LENGTH,
  getLengthError,
  normalizeOptionalText,
  normalizeWhitespace,
  parseCopInput,
  parseWholeNumberInput,
  validateImageFile,
} from "@/lib/admin-form-utils"

import type { BunnyUploadSession, Course, Instructor } from "@/types"

export type CourseFieldName =
  | "title"
  | "shortDescription"
  | "description"
  | "category"
  | "instructorId"
  | "homeFeaturedPosition"
  | "price"
  | "courseDiscountValue"
  | "thumbnail"

export interface CourseActionState {
  error?: string
  success?: boolean
  successMessage?: string
  fieldErrors?: Partial<Record<CourseFieldName, string>>
}

export interface HomeFeaturedAssignment {
  id: string
  title: string
  position: number
  is_published: boolean
}

export interface CoursePreviewActionState {
  error?: string
  success?: boolean
  uploadSession?: BunnyUploadSession
  videoId?: string
}

const MAX_THUMBNAIL_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]

async function verifyAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") {
    return null
  }
  return user
}

/**
 * H-06: Upload thumbnail to Supabase Storage.
 * Uses service role client to bypass RLS for admin operations.
 */
async function uploadThumbnail(
  file: File,
  courseId: string
): Promise<string | null> {
  const ext = file.name.split(".").pop() ?? "jpg"
  const path = `${courseId}/thumbnail.${ext}`

  const supabase = createServiceRoleClient()

  const { error } = await supabase.storage
    .from("course-thumbnails")
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) return null

  const { data } = supabase.storage
    .from("course-thumbnails")
    .getPublicUrl(path)

  return data.publicUrl
}

async function findCourseUsingHomeFeaturedPosition(input: {
  supabase: Awaited<ReturnType<typeof createServerClient>>
  homeFeaturedPosition: number
  excludeCourseId?: string
}) {
  let query = input.supabase
    .from("courses")
    .select("id, title")
    .eq("home_featured_position", input.homeFeaturedPosition)

  if (input.excludeCourseId) {
    query = query.neq("id", input.excludeCourseId)
  }

  const { data } = await query.maybeSingle()
  return data
}

async function assignHomeFeaturedPosition(input: {
  adminSupabase: ReturnType<typeof createServiceRoleClient>
  courseId: string
  homeFeaturedPosition: number
  replaceHomeFeatured: boolean
}) {
  const rpcResult = await input.adminSupabase.rpc(
    "replace_course_home_featured_position",
    {
      target_course_id: input.courseId,
      target_position: input.homeFeaturedPosition,
      replace_existing: input.replaceHomeFeatured,
    }
  )

  if (!rpcResult.error) {
    return {
      replacedCourseTitle: (
        rpcResult.data as { replaced_course_title?: string | null } | null
      )?.replaced_course_title ?? null,
    }
  }

  const rpcErrorMessage = rpcResult.error.message ?? ""
  const rpcUnavailable = /replace_course_home_featured_position|schema cache|does not exist/i.test(
    rpcErrorMessage
  )

  if (!rpcUnavailable) {
    return { error: rpcErrorMessage }
  }

  const { data: conflictingCourse, error: conflictingCourseError } =
    await input.adminSupabase
      .from("courses")
      .select("id, title")
      .eq("home_featured_position", input.homeFeaturedPosition)
      .neq("id", input.courseId)
      .maybeSingle()

  if (conflictingCourseError) {
    return {
      error:
        conflictingCourseError.message ||
        "No se pudo consultar el destacado actual del home.",
    }
  }

  if (conflictingCourse && !input.replaceHomeFeatured) {
    return {
      error: `${getHomeFeaturedPositionLabel(input.homeFeaturedPosition)} ya esta asignado a "${conflictingCourse.title}". Activa el reemplazo para continuar.`,
    }
  }

  if (conflictingCourse) {
    const { error: clearError } = await input.adminSupabase
      .from("courses")
      .update({ home_featured_position: null })
      .eq("id", conflictingCourse.id)

    if (clearError) {
      return {
        error:
          clearError.message ||
          "No se pudo liberar la posicion destacada seleccionada.",
      }
    }
  }

  const { error: assignError } = await input.adminSupabase
    .from("courses")
    .update({ home_featured_position: input.homeFeaturedPosition })
    .eq("id", input.courseId)

  if (assignError) {
    return {
      error:
        assignError.message ||
        "No se pudo asignar la posicion destacada seleccionada.",
    }
  }

  return {
    replacedCourseTitle: conflictingCourse?.title ?? null,
  }
}

function getHomeFeaturedPositionLabel(position: number) {
  return position === 1 ? "Hero (1)" : `Destacado ${position}`
}

function buildCourseFieldErrorState(
  fieldErrors: Partial<Record<CourseFieldName, string>>
): CourseActionState {
  return {
    error: "Corrige los campos marcados.",
    fieldErrors,
  }
}

function parseHomeFeaturedPosition(rawValue: FormDataEntryValue | null) {
  const normalized = String(rawValue ?? "")
    .trim()
    .toLowerCase()

  if (!normalized || normalized === "none") {
    return { value: null as number | null }
  }

  const parsed = Number(normalized)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4) {
    return {
      value: null as number | null,
      error: "Selecciona una posicion valida para home.",
    }
  }

  return { value: parsed }
}

function validateCourseFormData(formData: FormData) {
  const title = normalizeWhitespace(String(formData.get("title") ?? ""))
  const description = normalizeOptionalText(String(formData.get("description") ?? ""))
  const shortDescription = normalizeOptionalText(
    String(formData.get("shortDescription") ?? "")
  )
  const category = String(formData.get("category") ?? "").trim()
  const instructorId = String(formData.get("instructorId") ?? "").trim()
  const homeFeaturedPositionResult = parseHomeFeaturedPosition(
    formData.get("homeFeaturedPosition")
  )
  const replaceHomeFeatured =
    String(formData.get("replaceHomeFeatured") ?? "").trim() === "true"
  const priceRaw = String(formData.get("price") ?? "")
  const isFree = formData.get("isFree") === "on"
  const isPublished = formData.get("isPublished") === "on"
  const courseDiscountEnabled =
    formData.get("courseDiscountEnabled") === "on" && !isFree
  const courseDiscountType = String(
    formData.get("courseDiscountType") ?? ""
  ).trim()
  const courseDiscountValueRaw = String(
    formData.get("courseDiscountValue") ?? ""
  ).trim()
  const thumbnailCandidate = formData.get("thumbnail")
  const thumbnailFile =
    thumbnailCandidate instanceof File && thumbnailCandidate.size > 0
      ? thumbnailCandidate
      : null

  const fieldErrors: Partial<Record<CourseFieldName, string>> = {}

  const titleError = getLengthError({
    value: title,
    label: "El titulo",
    required: true,
    min: COURSE_TITLE_MIN_LENGTH,
    max: COURSE_TITLE_MAX_LENGTH,
  })
  if (titleError) {
    fieldErrors.title = titleError
  }

  if (shortDescription) {
    const shortDescriptionError = getLengthError({
      value: shortDescription,
      label: "La descripcion corta",
      min: COURSE_SHORT_DESCRIPTION_MIN_LENGTH,
      max: COURSE_SHORT_DESCRIPTION_MAX_LENGTH,
    })
    if (shortDescriptionError) {
      fieldErrors.shortDescription = shortDescriptionError
    }
  }

  if (description) {
    const descriptionError = getLengthError({
      value: description,
      label: "La descripcion completa",
      max: COURSE_DESCRIPTION_MAX_LENGTH,
    })
    if (descriptionError) {
      fieldErrors.description = descriptionError
    }
  }

  if (!category || !["baile", "tatuaje"].includes(category)) {
    fieldErrors.category = "Selecciona una categoria valida."
  }

  if (!instructorId) {
    fieldErrors.instructorId = "Selecciona un instructor."
  }

  if (homeFeaturedPositionResult.error) {
    fieldErrors.homeFeaturedPosition = homeFeaturedPositionResult.error
  }

  const parsedPrice = isFree
    ? { pesos: 0 }
    : parseCopInput(priceRaw, {
        label: "El precio",
        required: true,
        minPesos: 1,
        maxPesos: COP_MAX_PESOS,
      })

  if (parsedPrice.error) {
    fieldErrors.price = parsedPrice.error
  }

  const thumbnailError = validateImageFile(thumbnailFile, {
    label: "La portada",
    allowedTypes: ALLOWED_TYPES,
    maxSizeBytes: MAX_THUMBNAIL_SIZE,
  })
  if (thumbnailError) {
    fieldErrors.thumbnail = thumbnailError
  }

  let discountConfig:
    | {
        course_discount_enabled: false
        course_discount_type: null
        course_discount_value: null
      }
    | {
        course_discount_enabled: true
        course_discount_type: "percentage" | "fixed"
        course_discount_value: number
      } = {
    course_discount_enabled: false,
    course_discount_type: null,
    course_discount_value: null,
  }

  if (courseDiscountEnabled) {
    if (courseDiscountType !== "percentage" && courseDiscountType !== "fixed") {
      fieldErrors.courseDiscountValue =
        "Selecciona un tipo de descuento valido."
    } else if (courseDiscountType === "percentage") {
      const parsedPercentage = parseWholeNumberInput(courseDiscountValueRaw, {
        label: "El descuento porcentual",
        required: true,
        min: 1,
        max: 100,
      })

      if (parsedPercentage.error || parsedPercentage.value === null) {
        fieldErrors.courseDiscountValue =
          parsedPercentage.error ??
          "Ingresa un descuento porcentual valido."
      } else {
        discountConfig = {
          course_discount_enabled: true,
          course_discount_type: "percentage",
          course_discount_value: parsedPercentage.value,
        }
      }
    } else {
      const parsedFixedAmount = parseCopInput(courseDiscountValueRaw, {
        label: "El descuento fijo",
        required: true,
        minPesos: 1,
        maxPesos: parsedPrice.pesos ?? COP_MAX_PESOS,
      })

      if (parsedFixedAmount.error || parsedFixedAmount.pesos === null) {
        fieldErrors.courseDiscountValue =
          parsedFixedAmount.error ?? "Ingresa un descuento fijo valido."
      } else if (
        typeof parsedPrice.pesos === "number" &&
        parsedFixedAmount.pesos > parsedPrice.pesos
      ) {
        fieldErrors.courseDiscountValue =
          "El descuento fijo no puede superar el precio lista actual."
      } else {
        discountConfig = {
          course_discount_enabled: true,
          course_discount_type: "fixed",
          course_discount_value: parsedFixedAmount.pesos * 100,
        }
      }
    }
  }

  return {
    fieldErrors,
    values: {
      title,
      description,
      shortDescription,
      category,
      instructorId,
      homeFeaturedPosition: homeFeaturedPositionResult.value,
      replaceHomeFeatured,
      isFree,
      isPublished,
      priceInCents: (parsedPrice.pesos ?? 0) * 100,
      thumbnailFile,
      discountConfig,
    },
  }
}

export async function createCourse(
  _prevState: CourseActionState,
  formData: FormData
): Promise<CourseActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const validation = validateCourseFormData(formData)
  if (Object.keys(validation.fieldErrors).length > 0) {
    return buildCourseFieldErrorState(validation.fieldErrors)
  }

  const {
    title,
    description,
    shortDescription,
    category,
    instructorId,
    homeFeaturedPosition,
    isFree,
    priceInCents,
    thumbnailFile,
    discountConfig,
  } = validation.values

  const slug = slugify(title)

  const supabase = await createServerClient()

  const { data: instructor } = await supabase
    .from("instructors")
    .select("id")
    .eq("id", instructorId)
    .maybeSingle()

  if (!instructor) {
    return buildCourseFieldErrorState({
      instructorId: "Selecciona un instructor valido.",
    })
  }

  // Ensure unique slug
  const { data: existing } = await supabase
    .from("courses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle()

  const finalSlug = existing ? `${slug}-${Date.now().toString(36)}` : slug

  const { data: course, error } = await supabase
    .from("courses")
    .insert({
      title: title.trim(),
      slug: finalSlug,
      description,
      short_description: shortDescription,
      category,
      instructor_id: instructorId,
      price: priceInCents,
      is_free: isFree,
      ...discountConfig,
      home_featured_position: homeFeaturedPosition,
      is_published: false,
    })
    .select("id")
    .single()

  if (error) {
    return { error: "No se pudo crear el curso. Intenta de nuevo." }
  }

  // H-06: Upload thumbnail if provided
  if (thumbnailFile) {
    const thumbnailUrl = await uploadThumbnail(thumbnailFile, course.id)
    if (thumbnailUrl) {
      await supabase
        .from("courses")
        .update({ thumbnail_url: thumbnailUrl })
        .eq("id", course.id)
    }
  }

  revalidatePath("/admin/cursos")
  revalidatePath("/")
  redirect(`/admin/cursos/${course.id}/editar`)
}

export async function updateCourse(
  courseId: string,
  _prevState: CourseActionState,
  formData: FormData
): Promise<CourseActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const validation = validateCourseFormData(formData)
  if (Object.keys(validation.fieldErrors).length > 0) {
    return buildCourseFieldErrorState(validation.fieldErrors)
  }

  const {
    title,
    description,
    shortDescription,
    category,
    instructorId,
    homeFeaturedPosition,
    replaceHomeFeatured,
    isFree,
    isPublished,
    priceInCents,
    thumbnailFile,
    discountConfig,
  } = validation.values

  const supabase = await createServerClient()

  const { data: instructor } = await supabase
    .from("instructors")
    .select("id")
    .eq("id", instructorId)
    .maybeSingle()

  if (!instructor) {
    return buildCourseFieldErrorState({
      instructorId: "Selecciona un instructor valido.",
    })
  }

  // Fetch current course to detect title change and publish toggle
  const { data: current } = await supabase
    .from("courses")
    .select("title, slug, is_published, home_featured_position")
    .eq("id", courseId)
    .single()

  if (!current) {
    return { error: "Curso no encontrado." }
  }

  if (isPublished && homeFeaturedPosition !== null) {
    const conflictingCourse = await findCourseUsingHomeFeaturedPosition({
      supabase,
      homeFeaturedPosition,
      excludeCourseId: courseId,
    })

    if (conflictingCourse) {
      if (!replaceHomeFeatured) {
        return {
          error:
            "Confirma el reemplazo para mover ese destacado del home a este curso.",
          fieldErrors: {
            homeFeaturedPosition: `${getHomeFeaturedPositionLabel(homeFeaturedPosition)} ya esta asignado a "${conflictingCourse.title}". Activa el reemplazo para continuar.`,
          },
        }
      }
    }
  }

  const now = new Date().toISOString()
  const publishedAt = isPublished && !current.is_published ? now : undefined
  const shouldAssignFeaturedPosition =
    isPublished && homeFeaturedPosition !== null
  const shouldKeepCurrentFeaturedPosition =
    shouldAssignFeaturedPosition &&
    current.home_featured_position === homeFeaturedPosition

  const updateData: TablesUpdate<"courses"> = {
    title: title.trim(),
    description,
    short_description: shortDescription,
    category,
    instructor_id: instructorId,
    price: priceInCents,
    is_free: isFree,
    ...discountConfig,
    home_featured_position:
      isPublished && !shouldAssignFeaturedPosition
        ? null
        : shouldKeepCurrentFeaturedPosition
          ? current.home_featured_position
          : null,
    is_published: isPublished,
  }

  if (publishedAt) {
    updateData.published_at = publishedAt
  }

  // H-06: Regenerate slug if title changed
  if (title.trim() !== current.title) {
    const newSlug = slugify(title.trim())

    // Ensure unique slug (exclude self)
    const { data: existingSlug } = await supabase
      .from("courses")
      .select("id")
      .eq("slug", newSlug)
      .neq("id", courseId)
      .maybeSingle()

    const finalSlug = existingSlug
      ? `${newSlug}-${Date.now().toString(36)}`
      : newSlug

    if (finalSlug !== current.slug) {
      updateData.slug = finalSlug

      // Insert slug redirect for 301
      const adminSupabase = createServiceRoleClient()
      await adminSupabase.from("slug_redirects").upsert(
        {
          old_slug: current.slug,
          new_slug: finalSlug,
          entity_type: "course",
        },
        { onConflict: "old_slug,entity_type" }
      )
    }
  }

  // H-06: Upload thumbnail if provided
  if (thumbnailFile) {
    const thumbnailUrl = await uploadThumbnail(thumbnailFile, courseId)
    if (thumbnailUrl) {
      updateData.thumbnail_url = thumbnailUrl
    }
  }

  const { error } = await supabase
    .from("courses")
    .update(updateData)
    .eq("id", courseId)

  if (error) {
    if (error.code === "23505") {
      return buildCourseFieldErrorState({
        homeFeaturedPosition:
          "Esa posicion destacada ya esta ocupada por otro curso publicado.",
      })
    }

    return { error: "No se pudo actualizar el curso." }
  }

  let successMessage = "Curso actualizado exitosamente."

  if (shouldAssignFeaturedPosition && !shouldKeepCurrentFeaturedPosition) {
    const adminSupabase = createServiceRoleClient()
    const featuredAssignment = await assignHomeFeaturedPosition({
      adminSupabase,
      courseId,
      homeFeaturedPosition,
      replaceHomeFeatured,
    })

    if (featuredAssignment.error) {
      return {
        error:
          "Se guardaron los cambios del curso, pero no se pudo actualizar el destacado del home.",
        fieldErrors: {
          homeFeaturedPosition:
            featuredAssignment.error,
        },
      }
    }

    if (featuredAssignment.replacedCourseTitle) {
      successMessage = `Curso destacado actualizado. "${featuredAssignment.replacedCourseTitle}" salio de ${getHomeFeaturedPositionLabel(homeFeaturedPosition)}.`
    } else {
      successMessage = `Curso destacado actualizado en ${getHomeFeaturedPositionLabel(homeFeaturedPosition)}.`
    }
  }

  const nextSlug =
    typeof updateData.slug === "string" ? updateData.slug : current.slug

  revalidatePath("/admin/cursos")
  revalidatePath(`/admin/cursos/${courseId}/editar`)
  revalidatePath("/")
  revalidatePath("/cursos")
  revalidatePath(`/cursos/${current.slug}`)
  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/cursos/${current.slug}`)
  if (nextSlug !== current.slug) {
    revalidatePath(`/cursos/${nextSlug}`)
    revalidatePath(`/dashboard/cursos/${nextSlug}`)
  }
  return { success: true, successMessage }
}

export async function prepareCoursePreviewUpload(
  courseId: string
): Promise<CoursePreviewActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const supabase = createServiceRoleClient()
  const { data: course } = await supabase
    .from("courses")
    .select("title")
    .eq("id", courseId)
    .single()

  if (!course) {
    return { error: "Curso no encontrado." }
  }

  try {
    const videoId = await createBunnyVideo(`${course.title} Preview`)
    return {
      success: true,
      uploadSession: createBunnyTusUploadSession(videoId),
      videoId,
    }
  } catch {
    return { error: "No se pudo preparar la vista previa en Bunny." }
  }
}

export async function commitCoursePreviewUpload(
  courseId: string,
  videoId: string
): Promise<CoursePreviewActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  if (!isManagedBunnyVideoId(videoId)) {
    return { error: "Vista previa invalida." }
  }

  const supabase = createServiceRoleClient()
  const { data: course } = await supabase
    .from("courses")
    .select("id, slug, preview_video_url, preview_bunny_video_id, preview_status, pending_preview_bunny_video_id, preview_last_state_changed_at")
    .eq("id", courseId)
    .single()

  if (!course) {
    return { error: "Curso no encontrado." }
  }

  const libraryId = env.BUNNY_LIBRARY_ID()
  const shouldKeepCurrentPreview =
    !!course.preview_video_url ||
    (!!course.preview_bunny_video_id && course.preview_status === "ready")
  const now = new Date().toISOString()

  const updateData = shouldKeepCurrentPreview
    ? {
        pending_preview_bunny_video_id: videoId,
        pending_preview_bunny_library_id: libraryId,
        pending_preview_status: "processing",
        preview_upload_error: null,
        preview_last_checked_at: null,
        preview_last_state_changed_at: now,
      }
    : {
        preview_bunny_video_id: videoId,
        preview_bunny_library_id: libraryId,
        preview_status: "processing",
        pending_preview_bunny_video_id: null,
        pending_preview_bunny_library_id: null,
        pending_preview_status: "none",
        preview_upload_error: null,
        preview_last_checked_at: null,
        preview_last_state_changed_at: now,
      }

  const { applied } = await updateBunnyMediaSnapshot(supabase, "courses", courseId, {
    preview_video_url: course.preview_video_url,
    preview_bunny_video_id: course.preview_bunny_video_id,
    preview_status: course.preview_status,
    pending_preview_bunny_video_id: course.pending_preview_bunny_video_id,
    preview_last_state_changed_at: course.preview_last_state_changed_at,
  }, updateData)

  if (!applied) {
    return { error: "La vista previa cambio. Actualiza la pagina e intenta de nuevo." }
  }

  revalidatePath(`/admin/cursos/${courseId}/editar`)
  revalidatePath(`/cursos/${course.slug}`)
  revalidatePath("/cursos")

  return { success: true }
}

export async function discardCoursePreviewUpload(
  courseId: string,
  videoId: string
): Promise<CoursePreviewActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }
  if (!isManagedBunnyVideoId(videoId)) return { error: "Vista previa invalida." }

  const supabase = createServiceRoleClient()
  const { data: course } = await supabase
    .from("courses")
    .select(
      "slug, preview_video_url, preview_bunny_video_id, pending_preview_bunny_video_id, preview_status, preview_last_state_changed_at"
    )
    .eq("id", courseId)
    .single()

  if (!course) {
    return { error: "Curso no encontrado." }
  }

  const updateData: TablesUpdate<"courses"> = {
    preview_upload_error: "No se pudo completar la subida del archivo.",
    preview_last_checked_at: null,
    preview_last_state_changed_at: new Date().toISOString(),
  }

  if (course.pending_preview_bunny_video_id === videoId) {
    updateData.pending_preview_bunny_video_id = null
    updateData.pending_preview_bunny_library_id = null
    updateData.pending_preview_status = "none"
  } else if (course.preview_bunny_video_id === videoId && course.preview_status !== "ready") {
    updateData.preview_bunny_video_id = null
    updateData.preview_bunny_library_id = null
    updateData.preview_status = course.preview_video_url ? "legacy" : "none"
  } else {
    // A delayed cancellation must not detach an already-promoted active video.
    return { error: "La vista previa ya cambio. Actualiza la pagina." }
  }

  const { applied } = await updateBunnyMediaSnapshot(supabase, "courses", courseId, {
    preview_video_url: course.preview_video_url,
    preview_bunny_video_id: course.preview_bunny_video_id,
    pending_preview_bunny_video_id: course.pending_preview_bunny_video_id,
    preview_status: course.preview_status,
    preview_last_state_changed_at: course.preview_last_state_changed_at,
  }, updateData)
  if (!applied) return { error: "La vista previa cambio. Actualiza la pagina." }
  await deleteBunnyVideo(videoId).catch(() => undefined)

  revalidatePath(`/admin/cursos/${courseId}/editar`)
  revalidatePath(`/cursos/${course.slug}`)
  revalidatePath("/cursos")

  return { success: true }
}

/**
 * Return the enrollment count for a course so the UI can warn the admin.
 */
export async function getCourseEnrollmentCount(
  courseId: string
): Promise<number> {
  const supabase = await createServerClient()
  const { count } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId)
  return count ?? 0
}

/** Hard deletion is deliberately retired: purchases and progress are historical records. */
export async function deleteCourse(_courseId: string): Promise<{ error?: string }> {
  void _courseId
  return { error: "La eliminación definitiva no está disponible. Archiva el curso para conservar las compras y el progreso." }
}

export type AdminCourseRow = Omit<Course, "instructor"> & {
  instructor: Pick<Instructor, "id" | "full_name">
  enrollment_count: number
}

export async function getAdminCourses(filters: { search?: string; state?: string; page?: number } = {}): Promise<{ courses: AdminCourseRow[]; totalCount: number; page: number; error?: string }> {
  const page = Math.max(1, Math.min(10000, Math.floor(filters.page || 1)))
  const admin = await verifyAdmin()
  if (!admin) return { courses: [], totalCount: 0, page, error: "No autorizado." }
  const { data, error } = await createServiceRoleClient().rpc("admin_courses_page", { p_search: filters.search?.trim() || "", p_state: filters.state || "", p_page: page })
  if (error) return { courses: [], totalCount: 0, page, error: "No pudimos cargar los cursos. Inténtalo de nuevo." }
  const result = data as unknown as { courses: AdminCourseRow[]; totalCount: number }
  return { courses: result.courses.map(c => ({ ...c, ...decorateCourseWithPricing(c as unknown as PriceableCourse) })) as AdminCourseRow[], totalCount: result.totalCount, page }
}

export async function getHomeFeaturedAssignments(): Promise<
  HomeFeaturedAssignment[]
> {
  const admin = await verifyAdmin()
  if (!admin) return []

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("courses")
    .select("id, title, home_featured_position, is_published")
    .eq("is_published", true)
    .not("home_featured_position", "is", null)
    .order("home_featured_position", { ascending: true, nullsFirst: false })

  if (error) return []

  return (data ?? [])
    .filter(
      (course): course is {
        id: string
        title: string
        home_featured_position: number
        is_published: boolean
      } => typeof course.home_featured_position === "number"
    )
    .map((course) => ({
      id: course.id,
      title: course.title,
      position: course.home_featured_position,
      is_published: course.is_published,
    }))
}
