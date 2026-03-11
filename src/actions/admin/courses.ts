"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import {
  createBunnyTusUploadSession,
  createBunnyVideo,
  deleteBunnyVideo,
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
  | "price"
  | "courseDiscountValue"
  | "thumbnail"

export interface CourseActionState {
  error?: string
  success?: boolean
  fieldErrors?: Partial<Record<CourseFieldName, string>>
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

function buildCourseFieldErrorState(
  fieldErrors: Partial<Record<CourseFieldName, string>>
): CourseActionState {
  return {
    error: "Corrige los campos marcados.",
    fieldErrors,
  }
}

function validateCourseFormData(formData: FormData) {
  const title = normalizeWhitespace(String(formData.get("title") ?? ""))
  const description = normalizeOptionalText(String(formData.get("description") ?? ""))
  const shortDescription = normalizeOptionalText(
    String(formData.get("shortDescription") ?? "")
  )
  const category = String(formData.get("category") ?? "").trim()
  const instructorId = String(formData.get("instructorId") ?? "").trim()
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
    .select("title, slug, is_published")
    .eq("id", courseId)
    .single()

  if (!current) {
    return { error: "Curso no encontrado." }
  }

  const now = new Date().toISOString()
  const publishedAt =
    isPublished && !current.is_published ? now : undefined

  const updateData: Record<string, unknown> = {
    title: title.trim(),
    description,
    short_description: shortDescription,
    category,
    instructor_id: instructorId,
    price: priceInCents,
    is_free: isFree,
    ...discountConfig,
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
    return { error: "No se pudo actualizar el curso." }
  }

  const nextSlug =
    typeof updateData.slug === "string" ? updateData.slug : current.slug

  revalidatePath("/admin/cursos")
  revalidatePath(`/admin/cursos/${courseId}/editar`)
  revalidatePath("/cursos")
  revalidatePath(`/cursos/${current.slug}`)
  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/cursos/${current.slug}`)
  if (nextSlug !== current.slug) {
    revalidatePath(`/cursos/${nextSlug}`)
    revalidatePath(`/dashboard/cursos/${nextSlug}`)
  }
  return { success: true }
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

  if (!videoId?.trim()) {
    return { error: "Vista previa invalida." }
  }

  const supabase = createServiceRoleClient()
  const { data: course } = await supabase
    .from("courses")
    .select("id, slug, preview_video_url, preview_bunny_video_id, preview_status")
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

  const { error } = await supabase
    .from("courses")
    .update(updateData)
    .eq("id", courseId)

  if (error) {
    return { error: "No se pudo guardar la vista previa del curso." }
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

  const supabase = createServiceRoleClient()
  const { data: course } = await supabase
    .from("courses")
    .select(
      "slug, preview_video_url, preview_bunny_video_id, pending_preview_bunny_video_id"
    )
    .eq("id", courseId)
    .single()

  if (!course) {
    return { error: "Curso no encontrado." }
  }

  const updateData: Record<string, unknown> = {
    preview_upload_error: "No se pudo completar la subida del archivo.",
    preview_last_checked_at: null,
    preview_last_state_changed_at: new Date().toISOString(),
  }

  if (course.pending_preview_bunny_video_id === videoId) {
    updateData.pending_preview_bunny_video_id = null
    updateData.pending_preview_bunny_library_id = null
    updateData.pending_preview_status = "none"
  } else if (course.preview_bunny_video_id === videoId) {
    updateData.preview_bunny_video_id = null
    updateData.preview_bunny_library_id = null
    updateData.preview_status = course.preview_video_url ? "legacy" : "none"
  }

  await supabase.from("courses").update(updateData).eq("id", courseId)
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

/**
 * US-033: Delete a course with full cascade.
 *
 * Unlike the previous implementation this no longer blocks when enrollments
 * exist. The admin UI shows a warning with the student count and requests
 * explicit confirmation before calling this action.
 *
 * Cascade order (manual where DB cascades are not configured):
 *   1. Fetch lesson IDs + Bunny video IDs + course preview assets
 *   2. Delete lesson_progress for all lessons
 *   3. Delete course_progress for the course
 *   4. Delete lessons
 *   5. Delete cart_items referencing this course
 *   6. Delete enrollments
 *   7. Delete the course row (preserves orders/order_items — historical data)
 *   8. Delete Bunny videos (best-effort, non-blocking)
 *   9. Revalidate + redirect
 */
export async function deleteCourse(
  courseId: string
): Promise<{ error?: string }> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const adminSupabase = createServiceRoleClient()

  // Step 1: Fetch lessons for this course (need IDs + Bunny video IDs)
  const [{ data: lessons }, { data: course }] = await Promise.all([
    adminSupabase
      .from("lessons")
      .select("id, bunny_video_id, pending_bunny_video_id")
      .eq("course_id", courseId),
    adminSupabase
      .from("courses")
      .select("preview_bunny_video_id, pending_preview_bunny_video_id")
      .eq("id", courseId)
      .single(),
  ])

  const lessonIds = (lessons ?? []).map((l: { id: string }) => l.id)
  const lessonVideoIds = (lessons ?? [])
    .flatMap(
      (l: { bunny_video_id: string | null; pending_bunny_video_id: string | null }) =>
        [l.bunny_video_id, l.pending_bunny_video_id].filter(Boolean)
    )
    .filter(Boolean) as string[]
  const previewVideoIds = [
    course?.preview_bunny_video_id ?? null,
    course?.pending_preview_bunny_video_id ?? null,
  ].filter(Boolean) as string[]
  const bunnyVideoIds = [...new Set([...lessonVideoIds, ...previewVideoIds])]

  // Step 2: Delete lesson_progress for all lessons in this course
  if (lessonIds.length > 0) {
    await adminSupabase
      .from("lesson_progress")
      .delete()
      .in("lesson_id", lessonIds)
  }

  // Step 3: Delete course_progress for the course
  await adminSupabase
    .from("course_progress")
    .delete()
    .eq("course_id", courseId)

  // Step 4: Delete lessons
  if (lessonIds.length > 0) {
    await adminSupabase.from("lessons").delete().eq("course_id", courseId)
  }

  // Step 5: Delete cart_items referencing this course
  await adminSupabase.from("cart_items").delete().eq("course_id", courseId)

  // Step 6: Delete enrollments
  await adminSupabase.from("enrollments").delete().eq("course_id", courseId)

  // Step 7: Delete the course row
  const { error: deleteCourseError } = await adminSupabase
    .from("courses")
    .delete()
    .eq("id", courseId)

  if (deleteCourseError) {
    return { error: "No se pudo eliminar el curso. Intenta de nuevo." }
  }

  // Step 8: Delete Bunny videos (best-effort — do not block the action)
  await Promise.allSettled(bunnyVideoIds.map((vid) => deleteBunnyVideo(vid)))

  revalidatePath("/admin/cursos")
  revalidatePath("/cursos")
  redirect("/admin/cursos")
}

export type AdminCourseRow = Omit<Course, "instructor"> & {
  instructor: Pick<Instructor, "id" | "full_name">
  enrollment_count: number
}

export async function getAdminCourses(): Promise<AdminCourseRow[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("courses")
    .select("*, instructors(id, full_name), enrollments(id)")
    .order("created_at", { ascending: false })

  if (error) return []

  return (data ?? []).map((c) => ({
    ...decorateCourseWithPricing(c as unknown as PriceableCourse),
    instructor: Array.isArray(c.instructors) ? c.instructors[0] : c.instructors,
    enrollment_count: Array.isArray(c.enrollments) ? c.enrollments.length : 0,
  })) as AdminCourseRow[]
}
