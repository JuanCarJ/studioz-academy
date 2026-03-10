"use server"

import { revalidatePath, unstable_noStore as noStore } from "next/cache"

import { recordAdminAuditLog } from "@/actions/admin/audit"
import { getCurrentUser } from "@/lib/supabase/auth"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { createServerClient } from "@/lib/supabase/server"
import { slugify } from "@/lib/utils"

import type { Event, EventImage, GalleryItem, Post, PostImage } from "@/types"

const EDITORIAL_ASSETS_BUCKET = "editorial-assets"
const MAX_EDITORIAL_IMAGE_SIZE = 5 * 1024 * 1024
const ALLOWED_EDITORIAL_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
]
let editorialBucketEnsured = false

export interface EditorialFormState {
  error?: string
  success?: boolean
}

async function verifyAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") return null
  return user
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo completar la operacion."
}

function isValidGalleryCategory(value: string): value is GalleryItem["category"] {
  return value === "baile" || value === "tatuaje"
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0
}

function getUploadedFile(formData: FormData, name: string) {
  const value = formData.get(name)
  return isUploadedFile(value) ? value : null
}

function getUploadedFiles(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .filter((value): value is File => isUploadedFile(value))
}

function revalidateEditorialPaths() {
  revalidatePath("/")
  revalidatePath("/admin/noticias")
  revalidatePath("/admin/galeria")
  revalidatePath("/admin/eventos")
  revalidatePath("/noticias")
  revalidatePath("/galeria")
  revalidatePath("/eventos")
}

async function uploadEditorialAsset(file: File, path: string) {
  if (!ALLOWED_EDITORIAL_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Solo se permiten imagenes JPG, PNG o WebP.")
  }

  if (file.size > MAX_EDITORIAL_IMAGE_SIZE) {
    throw new Error("La imagen no puede superar 5 MB.")
  }

  const supabase = createServiceRoleClient()
  if (!editorialBucketEnsured) {
    const { error: bucketError } = await supabase.storage.createBucket(
      EDITORIAL_ASSETS_BUCKET,
      {
        public: true,
        fileSizeLimit: `${MAX_EDITORIAL_IMAGE_SIZE}`,
        allowedMimeTypes: ALLOWED_EDITORIAL_IMAGE_TYPES,
      }
    )

    if (
      bucketError &&
      !bucketError.message.toLowerCase().includes("already") &&
      !bucketError.message.toLowerCase().includes("exists")
    ) {
      throw new Error("No se pudo preparar el almacenamiento editorial.")
    }

    editorialBucketEnsured = true
  }

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

function generateExcerpt(content: string, excerpt: string) {
  return excerpt || content.slice(0, 160)
}

async function getEventImagesMap(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  eventIds: string[]
) {
  if (eventIds.length === 0) return {} as Record<string, EventImage[]>

  const { data, error } = await supabase
    .from("event_images")
    .select("*")
    .in("event_id", eventIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[admin.editorial] Failed to load event images:", error)
    return {} as Record<string, EventImage[]>
  }

  return (data ?? []).reduce<Record<string, EventImage[]>>((acc, image) => {
    const key = image.event_id
    acc[key] ??= []
    acc[key].push(image as EventImage)
    return acc
  }, {})
}

function mergeEventsWithImages(
  events: Event[],
  imagesMap: Record<string, EventImage[]>
) {
  return events.map((event) => {
    const images = imagesMap[event.id] ?? []
    return {
      ...event,
      image_url: images[0]?.image_url ?? event.image_url,
      images,
    }
  })
}

function serializeEventForAudit(event: Event, images: EventImage[]) {
  return {
    ...event,
    images: images.map((image) => ({ ...image })),
  }
}

async function getEventImagesForEvent(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  eventId: string
) {
  const imagesMap = await getEventImagesMap(supabase, [eventId])
  return imagesMap[eventId] ?? []
}

async function syncEventImages(options: {
  supabase: Awaited<ReturnType<typeof createServerClient>>
  eventId: string
  existingImages: EventImage[]
  removeImageIds: string[]
  newFiles: File[]
}) {
  const removedIds = new Set(options.removeImageIds)
  const keptImages = options.existingImages.filter((image) => !removedIds.has(image.id))

  const uploadedUrls: string[] = []
  for (const [index, file] of options.newFiles.entries()) {
    const ext = file.name.split(".").pop() ?? "jpg"
    uploadedUrls.push(
      await uploadEditorialAsset(
        file,
        `events/${options.eventId}/${Date.now().toString(36)}-${index}.${ext}`
      )
    )
  }

  if (keptImages.length + uploadedUrls.length === 0) {
    throw new Error("Debes conservar o cargar al menos una imagen del evento.")
  }

  if (removedIds.size > 0) {
    const { error } = await options.supabase
      .from("event_images")
      .delete()
      .in("id", Array.from(removedIds))

    if (error) {
      throw new Error("No se pudieron eliminar las imagenes marcadas.")
    }
  }

  for (const [index, image] of keptImages.entries()) {
    const { error } = await options.supabase
      .from("event_images")
      .update({ sort_order: index })
      .eq("id", image.id)

    if (error) {
      throw new Error("No se pudo reordenar la galeria del evento.")
    }
  }

  if (uploadedUrls.length > 0) {
    const { error } = await options.supabase
      .from("event_images")
      .insert(
        uploadedUrls.map((imageUrl, index) => ({
          event_id: options.eventId,
          image_url: imageUrl,
          sort_order: keptImages.length + index,
        }))
      )

    if (error) {
      throw new Error("No se pudieron guardar las imagenes del evento.")
    }
  }

  const finalImages = await getEventImagesForEvent(options.supabase, options.eventId)
  const coverImageUrl = finalImages[0]?.image_url ?? null

  const { error: coverError } = await options.supabase
    .from("events")
    .update({ image_url: coverImageUrl })
    .eq("id", options.eventId)

  if (coverError) {
    throw new Error("No se pudo actualizar la portada del evento.")
  }

  return { finalImages, coverImageUrl }
}

async function getPostImagesMap(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  postIds: string[]
) {
  if (postIds.length === 0) return {} as Record<string, PostImage[]>

  const { data, error } = await supabase
    .from("post_images")
    .select("*")
    .in("post_id", postIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[admin.editorial] Failed to load post images:", error)
    return {} as Record<string, PostImage[]>
  }

  return (data ?? []).reduce<Record<string, PostImage[]>>((acc, image) => {
    const key = image.post_id
    acc[key] ??= []
    acc[key].push(image as PostImage)
    return acc
  }, {})
}

function mergePostsWithImages(
  posts: Post[],
  imagesMap: Record<string, PostImage[]>
) {
  return posts.map((post) => {
    const images = imagesMap[post.id] ?? []
    return {
      ...post,
      cover_image_url: images[0]?.image_url ?? post.cover_image_url,
      images,
    }
  })
}

function serializePostForAudit(post: Post, images: PostImage[]) {
  return {
    ...post,
    images: images.map((image) => ({ ...image })),
  }
}

async function getPostImagesForPost(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  postId: string
) {
  const imagesMap = await getPostImagesMap(supabase, [postId])
  return imagesMap[postId] ?? []
}

async function syncPostImages(options: {
  supabase: Awaited<ReturnType<typeof createServerClient>>
  postId: string
  existingImages: PostImage[]
  removeImageIds: string[]
  newFiles: File[]
}) {
  const removedIds = new Set(options.removeImageIds)
  const keptImages = options.existingImages.filter((image) => !removedIds.has(image.id))

  const uploadedUrls: string[] = []
  for (const [index, file] of options.newFiles.entries()) {
    const ext = file.name.split(".").pop() ?? "jpg"
    uploadedUrls.push(
      await uploadEditorialAsset(
        file,
        `posts/${options.postId}/${Date.now().toString(36)}-${index}.${ext}`
      )
    )
  }

  if (keptImages.length + uploadedUrls.length === 0) {
    throw new Error("Debes conservar o cargar al menos una imagen de la noticia.")
  }

  if (removedIds.size > 0) {
    const { error } = await options.supabase
      .from("post_images")
      .delete()
      .in("id", Array.from(removedIds))

    if (error) {
      throw new Error("No se pudieron eliminar las imagenes marcadas.")
    }
  }

  for (const [index, image] of keptImages.entries()) {
    const { error } = await options.supabase
      .from("post_images")
      .update({ sort_order: index })
      .eq("id", image.id)

    if (error) {
      throw new Error("No se pudo reordenar la galeria de la noticia.")
    }
  }

  if (uploadedUrls.length > 0) {
    const { error } = await options.supabase
      .from("post_images")
      .insert(
        uploadedUrls.map((imageUrl, index) => ({
          post_id: options.postId,
          image_url: imageUrl,
          sort_order: keptImages.length + index,
        }))
      )

    if (error) {
      throw new Error("No se pudieron guardar las imagenes de la noticia.")
    }
  }

  const finalImages = await getPostImagesForPost(options.supabase, options.postId)
  const coverImageUrl = finalImages[0]?.image_url ?? null

  const { error: coverError } = await options.supabase
    .from("posts")
    .update({ cover_image_url: coverImageUrl })
    .eq("id", options.postId)

  if (coverError) {
    throw new Error("No se pudo actualizar la portada de la noticia.")
  }

  return { finalImages, coverImageUrl }
}

async function buildUniquePostSlug(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  title: string,
  postId?: string
) {
  const baseSlug = slugify(title)

  let query = supabase.from("posts").select("id").eq("slug", baseSlug)
  if (postId) {
    query = query.neq("id", postId)
  }

  const { data: existingSlug } = await query.maybeSingle()

  return existingSlug ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug
}

export async function getAdminPosts(): Promise<Post[]> {
  noStore()
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

  const posts = (data ?? []) as Post[]
  const imagesMap = await getPostImagesMap(
    supabase,
    posts.map((post) => post.id)
  )

  return mergePostsWithImages(posts, imagesMap)
}

export async function getAdminEvents(): Promise<Event[]> {
  noStore()
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

  const events = (data ?? []) as Event[]
  const imagesMap = await getEventImagesMap(
    supabase,
    events.map((event) => event.id)
  )

  return mergeEventsWithImages(events, imagesMap)
}

export async function getAdminGalleryItems(): Promise<GalleryItem[]> {
  noStore()
  const admin = await verifyAdmin()
  if (!admin) return []

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("gallery_items")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[admin.editorial] Failed to load gallery items:", error)
    return []
  }

  return (data ?? []) as GalleryItem[]
}

export async function createNews(
  _prevState: EditorialFormState,
  formData: FormData
): Promise<EditorialFormState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const title = String(formData.get("title") ?? "").trim()
  const content = String(formData.get("content") ?? "").trim()
  const excerpt = String(formData.get("excerpt") ?? "").trim()
  const images = getUploadedFiles(formData, "images")

  if (!title || !content) {
    return { error: "Titulo y contenido son obligatorios." }
  }

  if (images.length === 0) {
    return { error: "Debes cargar al menos una imagen para la noticia." }
  }

  const supabase = await createServerClient()

  try {
    const finalSlug = await buildUniquePostSlug(supabase, title)
    const publishedAt = new Date().toISOString()

    const { data: created, error } = await supabase
      .from("posts")
      .insert({
        title,
        slug: finalSlug,
        content,
        excerpt: generateExcerpt(content, excerpt),
        cover_image_url: "pending://upload",
        is_published: true,
        published_at: publishedAt,
      })
      .select("*")
      .single()

    if (error || !created) {
      return { error: "No se pudo crear la noticia." }
    }

    try {
      const { finalImages, coverImageUrl } = await syncPostImages({
        supabase,
        postId: created.id,
        existingImages: [],
        removeImageIds: [],
        newFiles: images,
      })

      const { data: after, error: updateError } = await supabase
        .from("posts")
        .update({
          title,
          slug: finalSlug,
          content,
          excerpt: generateExcerpt(content, excerpt),
          cover_image_url: coverImageUrl,
          is_published: true,
          published_at: publishedAt,
        })
        .eq("id", created.id)
        .select("*")
        .single()

      if (updateError || !after) {
        throw new Error("No se pudo finalizar la publicacion de la noticia.")
      }

      await recordAdminAuditLog({
        action: "post.create",
        entityType: "post",
        entityId: after.id,
        afterData: serializePostForAudit(after as Post, finalImages),
      })

      revalidateEditorialPaths()
      return { success: true }
    } catch (error) {
      await supabase.from("post_images").delete().eq("post_id", created.id)
      await supabase.from("posts").delete().eq("id", created.id)
      return { error: toErrorMessage(error) }
    }
  } catch (error) {
    return { error: toErrorMessage(error) }
  }
}

export async function updateNews(
  newsId: string,
  _prevState: EditorialFormState,
  formData: FormData
): Promise<EditorialFormState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const title = String(formData.get("title") ?? "").trim()
  const content = String(formData.get("content") ?? "").trim()
  const excerpt = String(formData.get("excerpt") ?? "").trim()
  const newImages = getUploadedFiles(formData, "images")
  const removeImageIds = formData
    .getAll("removeImageIds")
    .map((value) => String(value))

  if (!title || !content) {
    return { error: "Titulo y contenido son obligatorios." }
  }

  const supabase = await createServerClient()

  try {
    const { data: before } = await supabase
      .from("posts")
      .select("*")
      .eq("id", newsId)
      .single()

    if (!before) return { error: "Noticia no encontrada." }

    const existingImages = await getPostImagesForPost(supabase, newsId)
    const keptImagesCount = existingImages.filter(
      (image) => !removeImageIds.includes(image.id)
    ).length

    if (keptImagesCount + newImages.length <= 0) {
      return { error: "La noticia debe conservar al menos una imagen." }
    }

    const nextSlug =
      title !== before.title
        ? await buildUniquePostSlug(supabase, title, newsId)
        : before.slug

    const { finalImages, coverImageUrl } = await syncPostImages({
      supabase,
      postId: newsId,
      existingImages,
      removeImageIds,
      newFiles: newImages,
    })

    const { data: after, error } = await supabase
      .from("posts")
      .update({
        title,
        slug: nextSlug,
        content,
        excerpt: generateExcerpt(content, excerpt),
        cover_image_url: coverImageUrl,
        is_published: true,
        published_at: before.published_at ?? new Date().toISOString(),
      })
      .eq("id", newsId)
      .select("*")
      .single()

    if (error || !after) {
      return { error: "No se pudo actualizar la noticia." }
    }

    if (nextSlug !== before.slug) {
      const adminSupabase = createServiceRoleClient()
      await adminSupabase.from("slug_redirects").upsert(
        {
          old_slug: before.slug,
          new_slug: nextSlug,
          entity_type: "post",
        },
        { onConflict: "old_slug,entity_type" }
      )
    }

    await recordAdminAuditLog({
      action: "post.update",
      entityType: "post",
      entityId: newsId,
      beforeData: serializePostForAudit(before as Post, existingImages),
      afterData: serializePostForAudit(after as Post, finalImages),
    })

    revalidateEditorialPaths()
    revalidatePath(`/noticias/${before.slug}`)
    revalidatePath(`/noticias/${after.slug}`)
    return { success: true }
  } catch (error) {
    return { error: toErrorMessage(error) }
  }
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
  const beforeImages = await getPostImagesForPost(supabase, newsId)

  const { error } = await supabase.from("posts").delete().eq("id", newsId)
  if (error) throw new Error("No se pudo eliminar la noticia.")

  await recordAdminAuditLog({
    action: "post.delete",
    entityType: "post",
    entityId: newsId,
    beforeData: before ? serializePostForAudit(before as Post, beforeImages) : null,
  })

  revalidateEditorialPaths()
  if (before?.slug) {
    revalidatePath(`/noticias/${before.slug}`)
  }
}

export async function createEvent(
  _prevState: EditorialFormState,
  formData: FormData
): Promise<EditorialFormState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const location = String(formData.get("location") ?? "").trim()
  const eventDate = String(formData.get("eventDate") ?? "").trim()
  const images = getUploadedFiles(formData, "images")

  if (!title || !eventDate || !location) {
    return { error: "Titulo, fecha y direccion son obligatorios." }
  }

  if (images.length === 0) {
    return { error: "Debes cargar al menos una imagen del evento." }
  }

  const supabase = await createServerClient()

  try {
    const { data: created, error } = await supabase
      .from("events")
      .insert({
        title,
        description: description || null,
        location,
        event_date: eventDate,
        image_url: "pending://upload",
        is_published: true,
      })
      .select("*")
      .single()

    if (error || !created) {
      return { error: "No se pudo crear el evento." }
    }

    try {
      const { finalImages, coverImageUrl } = await syncEventImages({
        supabase,
        eventId: created.id,
        existingImages: [],
        removeImageIds: [],
        newFiles: images,
      })

      const { data: after, error: updateError } = await supabase
        .from("events")
        .update({
          title,
          description: description || null,
          location,
          event_date: eventDate,
          image_url: coverImageUrl,
          is_published: true,
        })
        .eq("id", created.id)
        .select("*")
        .single()

      if (updateError || !after) {
        throw new Error("No se pudo finalizar la publicacion del evento.")
      }

      await recordAdminAuditLog({
        action: "event.create",
        entityType: "event",
        entityId: after.id,
        afterData: serializeEventForAudit(after as Event, finalImages),
      })

      revalidateEditorialPaths()
      return { success: true }
    } catch (error) {
      await supabase.from("event_images").delete().eq("event_id", created.id)
      await supabase.from("events").delete().eq("id", created.id)
      return { error: toErrorMessage(error) }
    }
  } catch (error) {
    return { error: toErrorMessage(error) }
  }
}

export async function updateEvent(
  eventId: string,
  _prevState: EditorialFormState,
  formData: FormData
): Promise<EditorialFormState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const location = String(formData.get("location") ?? "").trim()
  const eventDate = String(formData.get("eventDate") ?? "").trim()
  const newImages = getUploadedFiles(formData, "images")
  const removeImageIds = formData
    .getAll("removeImageIds")
    .map((value) => String(value))

  if (!title || !eventDate || !location) {
    return { error: "Titulo, fecha y direccion son obligatorios." }
  }

  const supabase = await createServerClient()

  try {
    const { data: before } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single()

    if (!before) return { error: "Evento no encontrado." }

    const existingImages = await getEventImagesForEvent(supabase, eventId)
    const keptImagesCount = existingImages.filter(
      (image) => !removeImageIds.includes(image.id)
    ).length

    if (keptImagesCount + newImages.length <= 0) {
      return { error: "El evento debe conservar al menos una imagen." }
    }

    const { finalImages, coverImageUrl } = await syncEventImages({
      supabase,
      eventId,
      existingImages,
      removeImageIds,
      newFiles: newImages,
    })

    const { data: after, error } = await supabase
      .from("events")
      .update({
        title,
        description: description || null,
        location,
        event_date: eventDate,
        image_url: coverImageUrl,
        is_published: true,
      })
      .eq("id", eventId)
      .select("*")
      .single()

    if (error || !after) {
      return { error: "No se pudo actualizar el evento." }
    }

    await recordAdminAuditLog({
      action: "event.update",
      entityType: "event",
      entityId: eventId,
      beforeData: serializeEventForAudit(before as Event, existingImages),
      afterData: serializeEventForAudit(after as Event, finalImages),
    })

    revalidateEditorialPaths()
    return { success: true }
  } catch (error) {
    return { error: toErrorMessage(error) }
  }
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
  const beforeImages = await getEventImagesForEvent(supabase, eventId)

  const { error } = await supabase.from("events").delete().eq("id", eventId)
  if (error) throw new Error("No se pudo eliminar el evento.")

  await recordAdminAuditLog({
    action: "event.delete",
    entityType: "event",
    entityId: eventId,
    beforeData: before ? serializeEventForAudit(before as Event, beforeImages) : null,
  })

  revalidateEditorialPaths()
}

export async function createGalleryImage(
  _prevState: EditorialFormState,
  formData: FormData
): Promise<EditorialFormState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const caption = String(formData.get("caption") ?? "").trim()
  const category = String(formData.get("category") ?? "").trim()
  const image = getUploadedFile(formData, "image")

  if (!caption) {
    return { error: "El nombre es obligatorio." }
  }

  if (!isValidGalleryCategory(category)) {
    return { error: "Categoria invalida." }
  }

  if (!image) {
    return { error: "Debes subir una imagen para la galeria." }
  }

  const supabase = await createServerClient()

  try {
    const { data: created, error } = await supabase
      .from("gallery_items")
      .insert({
        caption,
        category,
        image_url: "pending://upload",
      })
      .select("*")
      .single()

    if (error || !created) {
      return { error: "No se pudo crear el item de galeria." }
    }

    try {
      const imageUrl = await uploadEditorialAsset(
        image,
        `gallery/${created.id}.${image.name.split(".").pop() ?? "jpg"}`
      )

      const { data: finalItem, error: updateError } = await supabase
        .from("gallery_items")
        .update({ image_url: imageUrl })
        .eq("id", created.id)
        .select("*")
        .single()

      if (updateError || !finalItem) {
        throw new Error("No se pudo finalizar la carga de la imagen.")
      }

      await recordAdminAuditLog({
        action: "gallery.create",
        entityType: "gallery_item",
        entityId: finalItem.id,
        afterData: finalItem,
      })

      revalidateEditorialPaths()
      return { success: true }
    } catch (error) {
      await supabase.from("gallery_items").delete().eq("id", created.id)
      return { error: toErrorMessage(error) }
    }
  } catch (error) {
    return { error: toErrorMessage(error) }
  }
}

export async function updateGalleryImage(
  imageId: string,
  _prevState: EditorialFormState,
  formData: FormData
): Promise<EditorialFormState> {
  const admin = await verifyAdmin()
  if (!admin) return { error: "No autorizado." }

  const caption = String(formData.get("caption") ?? "").trim()
  const category = String(formData.get("category") ?? "").trim()
  const image = getUploadedFile(formData, "image")

  if (!caption) {
    return { error: "El nombre es obligatorio." }
  }

  if (!isValidGalleryCategory(category)) {
    return { error: "Categoria invalida." }
  }

  const supabase = await createServerClient()

  try {
    const { data: before } = await supabase
      .from("gallery_items")
      .select("*")
      .eq("id", imageId)
      .single()

    if (!before) return { error: "Imagen no encontrada." }

    if (!before.image_url && !image) {
      return { error: "La galeria debe conservar una imagen cargada." }
    }

    let imageUrl = before.image_url
    if (image) {
      imageUrl = await uploadEditorialAsset(
        image,
        `gallery/${imageId}.${image.name.split(".").pop() ?? "jpg"}`
      )
    }

    const { data: after, error } = await supabase
      .from("gallery_items")
      .update({
        caption,
        category,
        image_url: imageUrl,
      })
      .eq("id", imageId)
      .select("*")
      .single()

    if (error || !after) {
      return { error: "No se pudo actualizar la galeria." }
    }

    await recordAdminAuditLog({
      action: "gallery.update",
      entityType: "gallery_item",
      entityId: imageId,
      beforeData: before,
      afterData: after,
    })

    revalidateEditorialPaths()
    return { success: true }
  } catch (error) {
    return { error: toErrorMessage(error) }
  }
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

  revalidateEditorialPaths()
}
