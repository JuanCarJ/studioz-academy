"use server"

import { revalidatePath, unstable_noStore as noStore } from "next/cache"

import { createServiceRoleClient } from "@/lib/supabase/admin"
import { createServerClient } from "@/lib/supabase/server"

import type {
  ContactMessage,
  Course,
  Event,
  EventImage,
  GalleryItem,
  Instructor,
  Post,
} from "@/types"

export interface PublishedCoursePreview
  extends Pick<
    Course,
    | "id"
    | "title"
    | "slug"
    | "short_description"
    | "thumbnail_url"
    | "price"
    | "category"
    | "is_free"
    | "rating_avg"
    | "reviews_count"
    | "published_at"
  > {
  instructor: Pick<Instructor, "id" | "full_name">
  isNew: boolean
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function computeIsNew(publishedAt: string | null): boolean {
  if (!publishedAt) return false
  return Date.now() - new Date(publishedAt).getTime() < THIRTY_DAYS_MS
}

async function getEventImagesMap(
  supabase: ReturnType<typeof createServiceRoleClient>,
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
    console.error("[editorial] Failed to load event images:", error)
    return {} as Record<string, EventImage[]>
  }

  return (data ?? []).reduce<Record<string, EventImage[]>>((acc, image) => {
    acc[image.event_id] ??= []
    acc[image.event_id].push(image as EventImage)
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

export async function getPublishedPosts(): Promise<Post[]> {
  noStore()
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("is_published", true)
    .order("published_at", { ascending: false, nullsFirst: false })

  if (error) {
    console.error("[editorial] Failed to load posts:", error)
    return []
  }

  return (data ?? []) as Post[]
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  noStore()
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle()

  if (error || !data) return null
  return data as Post
}

export async function getPublishedEvents(): Promise<Event[]> {
  noStore()
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("is_published", true)
    .order("event_date", { ascending: true })

  if (error) {
    console.error("[editorial] Failed to load events:", error)
    return []
  }

  const events = (data ?? []) as Event[]
  const imagesMap = await getEventImagesMap(
    supabase,
    events.map((event) => event.id)
  )

  return mergeEventsWithImages(events, imagesMap)
}

export async function getPublishedEventsTimeline(): Promise<{
  upcoming: Event[]
  past: Event[]
}> {
  const events = await getPublishedEvents()
  const now = Date.now()

  return {
    upcoming: events.filter(
      (event) => new Date(event.event_date).getTime() >= now
    ),
    past: events
      .filter((event) => new Date(event.event_date).getTime() < now)
      .sort(
        (a, b) =>
          new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
      ),
  }
}

export async function getGalleryItems(): Promise<GalleryItem[]> {
  noStore()
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from("gallery_items")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[editorial] Failed to load gallery items:", error)
    return []
  }

  return (data ?? []) as GalleryItem[]
}

export async function getHomePageData(): Promise<{
  featuredCourses: PublishedCoursePreview[]
  latestPosts: Post[]
  upcomingEvents: Event[]
  galleryPreview: GalleryItem[]
  stats: {
    publishedCourses: number
    publishedPosts: number
    galleryItems: number
    upcomingEvents: number
  }
}> {
  noStore()
  const supabase = createServiceRoleClient()
  const nowIso = new Date().toISOString()

  const [
    coursesResult,
    postsResult,
    eventsResult,
    galleryResult,
    countsResult,
  ] = await Promise.all([
    supabase
      .from("courses")
      .select(
        "id, title, slug, short_description, thumbnail_url, price, category, is_free, rating_avg, reviews_count, published_at, instructors(id, full_name)"
      )
      .eq("is_published", true)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(4),
    supabase
      .from("posts")
      .select("*")
      .eq("is_published", true)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(3),
    supabase
      .from("events")
      .select("*")
      .eq("is_published", true)
      .gte("event_date", nowIso)
      .order("event_date", { ascending: true })
      .limit(3),
    supabase
      .from("gallery_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(6),
    Promise.all([
      supabase
        .from("courses")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true),
      supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true),
      supabase
        .from("gallery_items")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true)
        .gte("event_date", nowIso),
    ]),
  ])

  const featuredCourses = (coursesResult.data ?? []).map((course) => ({
    ...course,
    instructor: Array.isArray(course.instructors)
      ? course.instructors[0]
      : course.instructors,
    isNew: computeIsNew(course.published_at),
  })) as PublishedCoursePreview[]

  const [coursesCount, postsCount, galleryCount, eventsCount] = countsResult
  const upcomingEvents = (eventsResult.data ?? []) as Event[]
  const upcomingImagesMap = await getEventImagesMap(
    supabase,
    upcomingEvents.map((event) => event.id)
  )

  return {
    featuredCourses,
    latestPosts: (postsResult.data ?? []) as Post[],
    upcomingEvents: mergeEventsWithImages(upcomingEvents, upcomingImagesMap),
    galleryPreview: (galleryResult.data ?? []) as GalleryItem[],
    stats: {
      publishedCourses: coursesCount.count ?? 0,
      publishedPosts: postsCount.count ?? 0,
      galleryItems: galleryCount.count ?? 0,
      upcomingEvents: eventsCount.count ?? 0,
    },
  }
}

export async function submitContactMessage(
  _prevState: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
  const subject = String(formData.get("subject") ?? "").trim()
  const message = String(formData.get("message") ?? "").trim()

  if (!name || !email || !message) {
    return { error: "Nombre, email y mensaje son obligatorios." }
  }

  const supabase = await createServerClient()
  const { error } = await supabase.from("contact_messages").insert({
    name,
    email,
    subject: subject || null,
    message,
  })

  if (error) {
    console.error("[editorial] Failed to submit contact message:", error)
    return { error: "No se pudo enviar tu mensaje. Intenta de nuevo." }
  }

  revalidatePath("/contacto")
  return { success: true }
}

export async function getContactMessages(): Promise<ContactMessage[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("contact_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    console.error("[editorial] Failed to load contact messages:", error)
    return []
  }

  return (data ?? []) as ContactMessage[]
}
