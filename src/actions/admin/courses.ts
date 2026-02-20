"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/admin"
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

export async function deleteCourse(courseId: string) {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const supabase = await createServerClient()

  // Check active enrollments before deleting
  const { count } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId)

  if (count && count > 0) {
    return { error: "No se puede eliminar un curso con estudiantes inscritos." }
  }

  const { error } = await supabase
    .from("courses")
    .delete()
    .eq("id", courseId)

  if (error) {
    return { error: "No se pudo eliminar el curso." }
  }

  revalidatePath("/admin/cursos")
  redirect("/admin/cursos")
}

export async function getAdminCourses(): Promise<
  (Course & { instructor: Pick<Instructor, "id" | "full_name"> })[]
> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("courses")
    .select("*, instructors(id, full_name)")
    .order("created_at", { ascending: false })

  if (error) return []

  return (data ?? []).map((c) => ({
    ...c,
    instructor: Array.isArray(c.instructors) ? c.instructors[0] : c.instructors,
  })) as (Course & { instructor: Pick<Instructor, "id" | "full_name"> })[]
}
