"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { deleteBunnyVideo } from "@/lib/bunny"
import { slugify } from "@/lib/utils"

import type { Course, Instructor } from "@/types"

export interface CourseActionState {
  error?: string
  success?: boolean
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
  if (!ALLOWED_TYPES.includes(file.type)) return null
  if (file.size > MAX_THUMBNAIL_SIZE) return null

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

export async function createCourse(
  _prevState: CourseActionState,
  formData: FormData
): Promise<CourseActionState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const title = formData.get("title") as string
  const description = (formData.get("description") as string) || null
  const shortDescription = (formData.get("shortDescription") as string) || null
  const category = formData.get("category") as string
  const instructorId = formData.get("instructorId") as string
  const priceRaw = formData.get("price") as string
  const isFree = formData.get("isFree") === "on"
  const previewVideoUrl = (formData.get("previewVideoUrl") as string) || null

  if (!title?.trim()) {
    return { error: "El titulo es obligatorio." }
  }
  if (!category || !["baile", "tatuaje"].includes(category)) {
    return { error: "La categoria debe ser 'baile' o 'tatuaje'." }
  }
  if (!instructorId) {
    return { error: "El instructor es obligatorio." }
  }

  // Price: in COP pesos from form, stored as centavos
  const priceInCents = isFree ? 0 : Math.round(Number(priceRaw) * 100)
  if (!isFree && (isNaN(priceInCents) || priceInCents <= 0)) {
    return { error: "El precio debe ser mayor a 0 para cursos pagos." }
  }

  const slug = slugify(title)

  const supabase = await createServerClient()

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
      preview_video_url: previewVideoUrl,
      is_published: false,
    })
    .select("id")
    .single()

  if (error) {
    return { error: "No se pudo crear el curso. Intenta de nuevo." }
  }

  // H-06: Upload thumbnail if provided
  const thumbnailFile = formData.get("thumbnail") as File | null
  if (thumbnailFile && thumbnailFile.size > 0) {
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

  const title = formData.get("title") as string
  const description = (formData.get("description") as string) || null
  const shortDescription = (formData.get("shortDescription") as string) || null
  const category = formData.get("category") as string
  const instructorId = formData.get("instructorId") as string
  const priceRaw = formData.get("price") as string
  const isFree = formData.get("isFree") === "on"
  const isPublished = formData.get("isPublished") === "on"
  const previewVideoUrl = (formData.get("previewVideoUrl") as string) || null

  if (!title?.trim()) {
    return { error: "El titulo es obligatorio." }
  }
  if (!category || !["baile", "tatuaje"].includes(category)) {
    return { error: "La categoria debe ser 'baile' o 'tatuaje'." }
  }
  if (!instructorId) {
    return { error: "El instructor es obligatorio." }
  }

  const priceInCents = isFree ? 0 : Math.round(Number(priceRaw) * 100)
  if (!isFree && (isNaN(priceInCents) || priceInCents <= 0)) {
    return { error: "El precio debe ser mayor a 0 para cursos pagos." }
  }

  const supabase = await createServerClient()

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
    is_published: isPublished,
    preview_video_url: previewVideoUrl,
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
  const thumbnailFile = formData.get("thumbnail") as File | null
  if (thumbnailFile && thumbnailFile.size > 0) {
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

  revalidatePath("/admin/cursos")
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
 *   1. Fetch lesson IDs + Bunny video IDs
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
  const { data: lessons } = await adminSupabase
    .from("lessons")
    .select("id, bunny_video_id")
    .eq("course_id", courseId)

  const lessonIds = (lessons ?? []).map((l: { id: string }) => l.id)
  const bunnyVideoIds = (lessons ?? [])
    .map((l: { bunny_video_id: string }) => l.bunny_video_id)
    .filter(Boolean) as string[]

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
    ...c,
    instructor: Array.isArray(c.instructors) ? c.instructors[0] : c.instructors,
    enrollment_count: Array.isArray(c.enrollments) ? c.enrollments.length : 0,
  })) as AdminCourseRow[]
}
