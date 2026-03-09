"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { createServerClient } from "@/lib/supabase/server"
import { slugify } from "@/lib/utils"
import { recordAdminAuditLog } from "@/actions/admin/audit"

import type { Event, GalleryItem, Post } from "@/types"

const EDITORIAL_ASSETS_BUCKET = "editorial-assets"
const MAX_EDITORIAL_IMAGE_SIZE = 5 * 1024 * 1024
const ALLOWED_EDITORIAL_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
]

async function verifyAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") return null
  return user
}

async function uploadEditorialAsset(file: File, path: string) {
  if (!ALLOWED_EDITORIAL_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Solo se permiten imagenes JPG, PNG o WebP.")
  }

  if (file.size > MAX_EDITORIAL_IMAGE_SIZE) {
    throw new Error("La imagen no puede superar 5 MB.")
  }

  const supabase = createServiceRoleClient()
  const { error } = await supabase.storage
    .from(EDITORIAL_ASSETS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) {
    throw new Error("No se pudo subir la imagen.")
  }

  const { data } = supabase.storage
    .from(EDITORIAL_ASSETS_BUCKET)
    .getPublicUrl(path)

  return data.publicUrl
}

async function resolveImageUrl(options: {
  file: File | null
  imageUrl: string | null
  folder: string
  objectId: string
}) {
  if (options.file && options.file.size > 0) {
    const ext = options.file.name.split(".").pop() ?? "jpg"
    return uploadEditorialAsset(
      options.file,
      `${options.folder}/${options.objectId}.${ext}`
    )
  }

  return options.imageUrl?.trim() || null
}

function parsePublishedFlag(formData: FormData) {
  return formData.get("isPublished") === "on"
}

export async function getAdminPosts(): Promise<Post[]> {
  const admin = await verifyAdmin()
  if (!admin) return []

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[admin.editorial] Failed to load posts:", error)
    return []
  }

  return (data ?? []) as Post[]
}

export async function getAdminEvents(): Promise<Event[]> {
  const admin = await verifyAdmin()
  if (!admin) return []

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("event_date", { ascending: false })

  if (error) {
    console.error("[admin.editorial] Failed to load events:", error)
    return []
  }

  return (data ?? []) as Event[]
}

export async function getAdminGalleryItems(): Promise<GalleryItem[]> {
  const admin = await verifyAdmin()
  if (!admin) return []

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("gallery_items")
    .select("*")
    .order("sort_order")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[admin.editorial] Failed to load gallery items:", error)
    return []
  }

  return (data ?? []) as GalleryItem[]
}

export async function createNews(formData: FormData) {
  const admin = await verifyAdmin()
  if (!admin) throw new Error("No autorizado.")

  const title = String(formData.get("title") ?? "").trim()
  const content = String(formData.get("content") ?? "").trim()
  const excerpt = String(formData.get("excerpt") ?? "").trim()
  const isPublished = parsePublishedFlag(formData)

  if (!title || !content) {
    throw new Error("Titulo y contenido son obligatorios.")
  }

  const supabase = await createServerClient()
  const baseSlug = slugify(title)
  const { data: existingSlug } = await supabase
    .from("posts")
    .select("id")
    .eq("slug", baseSlug)
    .maybeSingle()

  const finalSlug = existingSlug ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug

  const { data: created, error } = await supabase
    .from("posts")
    .insert({
      title,
      slug: finalSlug,
      content,
      excerpt: excerpt || content.slice(0, 160),
      is_published: isPublished,
      published_at: isPublished ? new Date().toISOString() : null,
    })
    .select("*")
    .single()

  if (error || !created) {
    throw new Error("No se pudo crear la noticia.")
  }

  const imageUrl = await resolveImageUrl({
    file: formData.get("coverImage") as File | null,
    imageUrl: (formData.get("coverImageUrl") as string | null) ?? null,
    folder: "posts",
    objectId: created.id,
  })

  let finalPost = created
  if (imageUrl) {
    const { data: updated } = await supabase
      .from("posts")
      .update({ cover_image_url: imageUrl })
      .eq("id", created.id)
      .select("*")
      .single()

    if (updated) finalPost = updated
  }

  await recordAdminAuditLog({
    action: "post.create",
    entityType: "post",
    entityId: finalPost.id,
    afterData: finalPost,
  })

  revalidatePath("/")
  revalidatePath("/admin/noticias")
  revalidatePath("/noticias")
}

export async function updateNews(newsId: string, formData: FormData) {
  const admin = await verifyAdmin()
  if (!admin) throw new Error("No autorizado.")

  const title = String(formData.get("title") ?? "").trim()
  const content = String(formData.get("content") ?? "").trim()
  const excerpt = String(formData.get("excerpt") ?? "").trim()
  const isPublished = parsePublishedFlag(formData)

  if (!title || !content) {
    throw new Error("Titulo y contenido son obligatorios.")
  }

  const supabase = await createServerClient()
  const { data: before } = await supabase
    .from("posts")
    .select("*")
    .eq("id", newsId)
    .single()

  if (!before) throw new Error("Noticia no encontrada.")

  const updateData: Record<string, unknown> = {
    title,
    content,
    excerpt: excerpt || content.slice(0, 160),
    is_published: isPublished,
  }

  if (title !== before.title) {
    const baseSlug = slugify(title)
    const { data: existingSlug } = await supabase
      .from("posts")
      .select("id")
      .eq("slug", baseSlug)
      .neq("id", newsId)
      .maybeSingle()

    updateData.slug = existingSlug
      ? `${baseSlug}-${Date.now().toString(36)}`
      : baseSlug
  }

  if (isPublished && !before.published_at) {
    updateData.published_at = new Date().toISOString()
  }

  const imageUrl = await resolveImageUrl({
    file: formData.get("coverImage") as File | null,
    imageUrl: (formData.get("coverImageUrl") as string | null) ?? before.cover_image_url,
    folder: "posts",
    objectId: newsId,
  })

  if (imageUrl) {
    updateData.cover_image_url = imageUrl
  }

  const { data: after, error } = await supabase
    .from("posts")
    .update(updateData)
    .eq("id", newsId)
    .select("*")
    .single()

  if (error || !after) {
    throw new Error("No se pudo actualizar la noticia.")
  }

  await recordAdminAuditLog({
    action: "post.update",
    entityType: "post",
    entityId: newsId,
    beforeData: before,
    afterData: after,
  })

  revalidatePath("/")
  revalidatePath("/admin/noticias")
  revalidatePath("/noticias")
  revalidatePath(`/noticias/${after.slug}`)
}

export async function deleteNews(newsId: string) {
  const admin = await verifyAdmin()
  if (!admin) throw new Error("No autorizado.")

  const supabase = await createServerClient()
  const { data: before } = await supabase
    .from("posts")
    .select("*")
    .eq("id", newsId)
    .single()

  const { error } = await supabase.from("posts").delete().eq("id", newsId)
  if (error) throw new Error("No se pudo eliminar la noticia.")

  await recordAdminAuditLog({
    action: "post.delete",
    entityType: "post",
    entityId: newsId,
    beforeData: before ?? null,
  })

  revalidatePath("/")
  revalidatePath("/admin/noticias")
  revalidatePath("/noticias")
}

export async function createEvent(formData: FormData) {
  const admin = await verifyAdmin()
  if (!admin) throw new Error("No autorizado.")

  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const location = String(formData.get("location") ?? "").trim()
  const eventDate = String(formData.get("eventDate") ?? "").trim()
  const isPublished = parsePublishedFlag(formData)

  if (!title || !eventDate) {
    throw new Error("Titulo y fecha son obligatorios.")
  }

  const supabase = await createServerClient()
  const { data: created, error } = await supabase
    .from("events")
    .insert({
      title,
      description: description || null,
      location: location || null,
      event_date: eventDate,
      is_published: isPublished,
    })
    .select("*")
    .single()

  if (error || !created) {
    throw new Error("No se pudo crear el evento.")
  }

  const imageUrl = await resolveImageUrl({
    file: formData.get("image") as File | null,
    imageUrl: (formData.get("imageUrl") as string | null) ?? null,
    folder: "events",
    objectId: created.id,
  })

  let finalEvent = created
  if (imageUrl) {
    const { data: updated } = await supabase
      .from("events")
      .update({ image_url: imageUrl })
      .eq("id", created.id)
      .select("*")
      .single()

    if (updated) finalEvent = updated
  }

  await recordAdminAuditLog({
    action: "event.create",
    entityType: "event",
    entityId: finalEvent.id,
    afterData: finalEvent,
  })

  revalidatePath("/")
  revalidatePath("/admin/eventos")
  revalidatePath("/eventos")
}

export async function updateEvent(eventId: string, formData: FormData) {
  const admin = await verifyAdmin()
  if (!admin) throw new Error("No autorizado.")

  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const location = String(formData.get("location") ?? "").trim()
  const eventDate = String(formData.get("eventDate") ?? "").trim()
  const isPublished = parsePublishedFlag(formData)

  if (!title || !eventDate) {
    throw new Error("Titulo y fecha son obligatorios.")
  }

  const supabase = await createServerClient()
  const { data: before } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single()

  if (!before) throw new Error("Evento no encontrado.")

  const imageUrl = await resolveImageUrl({
    file: formData.get("image") as File | null,
    imageUrl: (formData.get("imageUrl") as string | null) ?? before.image_url,
    folder: "events",
    objectId: eventId,
  })

  const { data: after, error } = await supabase
    .from("events")
    .update({
      title,
      description: description || null,
      location: location || null,
      event_date: eventDate,
      image_url: imageUrl,
      is_published: isPublished,
    })
    .eq("id", eventId)
    .select("*")
    .single()

  if (error || !after) {
    throw new Error("No se pudo actualizar el evento.")
  }

  await recordAdminAuditLog({
    action: "event.update",
    entityType: "event",
    entityId: eventId,
    beforeData: before,
    afterData: after,
  })

  revalidatePath("/")
  revalidatePath("/admin/eventos")
  revalidatePath("/eventos")
}

export async function deleteEvent(eventId: string) {
  const admin = await verifyAdmin()
  if (!admin) throw new Error("No autorizado.")

  const supabase = await createServerClient()
  const { data: before } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single()

  const { error } = await supabase.from("events").delete().eq("id", eventId)
  if (error) throw new Error("No se pudo eliminar el evento.")

  await recordAdminAuditLog({
    action: "event.delete",
    entityType: "event",
    entityId: eventId,
    beforeData: before ?? null,
  })

  revalidatePath("/")
  revalidatePath("/admin/eventos")
  revalidatePath("/eventos")
}

export async function createGalleryImage(formData: FormData) {
  const admin = await verifyAdmin()
  if (!admin) throw new Error("No autorizado.")

  const caption = String(formData.get("caption") ?? "").trim()
  const category = String(formData.get("category") ?? "").trim()
  const providedSortOrder = Number(formData.get("sortOrder") ?? NaN)

  if (!["baile", "tatuaje"].includes(category)) {
    throw new Error("Categoria invalida.")
  }

  const supabase = await createServerClient()
  const { data: lastItem } = await supabase
    .from("gallery_items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextSortOrder = lastItem ? lastItem.sort_order + 1 : 0

  const { data: created, error } = await supabase
    .from("gallery_items")
    .insert({
      caption: caption || null,
      category,
      image_url: "pending://upload",
      sort_order:
        Number.isFinite(providedSortOrder) && providedSortOrder >= 0
          ? Math.round(providedSortOrder)
          : nextSortOrder,
    })
    .select("*")
    .single()

  if (error || !created) {
    throw new Error("No se pudo crear el item de galeria.")
  }

  const imageUrl = await resolveImageUrl({
    file: formData.get("image") as File | null,
    imageUrl: (formData.get("imageUrl") as string | null) ?? null,
    folder: "gallery",
    objectId: created.id,
  })

  if (!imageUrl) {
    await supabase.from("gallery_items").delete().eq("id", created.id)
    throw new Error("Debes subir una imagen o indicar una URL.")
  }

  const { data: finalItem } = await supabase
    .from("gallery_items")
    .update({ image_url: imageUrl })
    .eq("id", created.id)
    .select("*")
    .single()

  await recordAdminAuditLog({
    action: "gallery.create",
    entityType: "gallery_item",
    entityId: created.id,
    afterData: finalItem ?? created,
  })

  revalidatePath("/")
  revalidatePath("/admin/galeria")
  revalidatePath("/galeria")
}

export async function updateGalleryImage(imageId: string, formData: FormData) {
  const admin = await verifyAdmin()
  if (!admin) throw new Error("No autorizado.")

  const caption = String(formData.get("caption") ?? "").trim()
  const category = String(formData.get("category") ?? "").trim()
  const sortOrder = Number(formData.get("sortOrder") ?? 0)

  if (!["baile", "tatuaje"].includes(category)) {
    throw new Error("Categoria invalida.")
  }

  const supabase = await createServerClient()
  const { data: before } = await supabase
    .from("gallery_items")
    .select("*")
    .eq("id", imageId)
    .single()

  if (!before) throw new Error("Imagen no encontrada.")

  const imageUrl = await resolveImageUrl({
    file: formData.get("image") as File | null,
    imageUrl: (formData.get("imageUrl") as string | null) ?? before.image_url,
    folder: "gallery",
    objectId: imageId,
  })

  const { data: after, error } = await supabase
    .from("gallery_items")
    .update({
      caption: caption || null,
      category,
      sort_order: Number.isFinite(sortOrder) ? Math.max(0, Math.round(sortOrder)) : before.sort_order,
      image_url: imageUrl ?? before.image_url,
    })
    .eq("id", imageId)
    .select("*")
    .single()

  if (error || !after) {
    throw new Error("No se pudo actualizar la galeria.")
  }

  await recordAdminAuditLog({
    action: "gallery.update",
    entityType: "gallery_item",
    entityId: imageId,
    beforeData: before,
    afterData: after,
  })

  revalidatePath("/")
  revalidatePath("/admin/galeria")
  revalidatePath("/galeria")
}

export async function deleteGalleryImage(imageId: string) {
  const admin = await verifyAdmin()
  if (!admin) throw new Error("No autorizado.")

  const supabase = await createServerClient()
  const { data: before } = await supabase
    .from("gallery_items")
    .select("*")
    .eq("id", imageId)
    .single()

  const { error } = await supabase
    .from("gallery_items")
    .delete()
    .eq("id", imageId)

  if (error) throw new Error("No se pudo eliminar la imagen.")

  await recordAdminAuditLog({
    action: "gallery.delete",
    entityType: "gallery_item",
    entityId: imageId,
    beforeData: before ?? null,
  })

  revalidatePath("/")
  revalidatePath("/admin/galeria")
  revalidatePath("/galeria")
}
