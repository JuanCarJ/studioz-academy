"use server"

import { unstable_noStore as noStore } from "next/cache"

import { decorateCourseWithPricing, type PriceableCourse } from "@/lib/pricing"
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
  PostImage,
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
    | "list_price"
    | "current_price"
    | "category"
    | "is_free"
    | "rating_avg"
    | "reviews_count"
    | "has_course_discount"
    | "course_discount_label"
    | "published_at"
    | "home_featured_position"
  > {
  instructor?: Pick<Instructor, "id" | "full_name">
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

async function getPostImagesMap(
  supabase: ReturnType<typeof createServiceRoleClient>,
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
    console.error("[editorial] Failed to load post images:", error)
    return {} as Record<string, PostImage[]>
  }

  return (data ?? []).reduce<Record<string, PostImage[]>>((acc, image) => {
    acc[image.post_id] ??= []
    acc[image.post_id].push(image as PostImage)
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

function decoratePublishedCoursePreview(
  course: PriceableCourse & {
    published_at: string | null
    instructors:
      | Pick<Instructor, "id" | "full_name">
      | Pick<Instructor, "id" | "full_name">[]
      | null
  }
): PublishedCoursePreview {
  return {
    ...decorateCourseWithPricing(course),
    instructor: Array.isArray(course.instructors)
      ? course.instructors[0]
      : course.instructors,
    isNew: computeIsNew(course.published_at),
  } as unknown as PublishedCoursePreview
}

function takeNextUnusedCourse(
  pool: PublishedCoursePreview[],
  usedIds: Set<string>
) {
  const nextCourse = pool.find((course) => !usedIds.has(course.id))
  if (!nextCourse) return null

  usedIds.add(nextCourse.id)
  return nextCourse
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

  const posts = (data ?? []) as Post[]
  const imagesMap = await getPostImagesMap(
    supabase,
    posts.map((post) => post.id)
  )

  return mergePostsWithImages(posts, imagesMap)
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

  const imagesMap = await getPostImagesMap(supabase, [data.id])
  return mergePostsWithImages([data as Post], imagesMap)[0] ?? (data as Post)
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
  heroCourse: PublishedCoursePreview | null
  featuredCourses: PublishedCoursePreview[]
  latestPosts: Post[]
  upcomingEvents: Event[]
  galleryPreview: GalleryItem[]
  categoryShowcase: {
    baile: GalleryItem | null
    tatuaje: GalleryItem | null
  }
  publishedCoursesCount: number
}> {
  noStore()
  const supabase = createServiceRoleClient()
  const nowIso = new Date().toISOString()
  const courseSelect =
    "id, title, slug, short_description, thumbnail_url, price, category, is_free, rating_avg, reviews_count, published_at, home_featured_position, course_discount_enabled, course_discount_type, course_discount_value, instructors(id, full_name)"

  const [
    curatedCoursesResult,
    recentCoursesResult,
    postsResult,
    eventsResult,
    galleryResult,
    coursesCountResult,
  ] = await Promise.all([
    supabase
      .from("courses")
      .select(courseSelect)
      .eq("is_published", true)
      .not("home_featured_position", "is", null)
      .order("home_featured_position", { ascending: true, nullsFirst: false })
      .limit(4),
    supabase
      .from("courses")
      .select(courseSelect)
      .eq("is_published", true)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(8),
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
      .limit(12),
    supabase
      .from("courses")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true),
  ])

  const curatedCourses = (curatedCoursesResult.data ?? []).map((course) =>
    decoratePublishedCoursePreview(
      course as PriceableCourse & {
        published_at: string | null
        instructors:
          | Pick<Instructor, "id" | "full_name">
          | Pick<Instructor, "id" | "full_name">[]
          | null
      }
    )
  )
  const recentCourses = (recentCoursesResult.data ?? []).map((course) =>
    decoratePublishedCoursePreview(
      course as PriceableCourse & {
        published_at: string | null
        instructors:
          | Pick<Instructor, "id" | "full_name">
          | Pick<Instructor, "id" | "full_name">[]
          | null
      }
    )
  )
  const fallbackPool = [...recentCourses, ...curatedCourses].filter(
    (course, index, allCourses) =>
      allCourses.findIndex((candidate) => candidate.id === course.id) === index
  )
  const curatedByPosition = new Map(
    curatedCourses
      .filter((course) => course.home_featured_position !== null)
      .map((course) => [course.home_featured_position!, course] as const)
  )
  const usedFeaturedCourseIds = new Set<string>()
  const curatedHeroCourse = curatedByPosition.get(1)
  const heroCourse =
    curatedHeroCourse && !usedFeaturedCourseIds.has(curatedHeroCourse.id)
      ? (usedFeaturedCourseIds.add(curatedHeroCourse.id), curatedHeroCourse)
      : takeNextUnusedCourse(fallbackPool, usedFeaturedCourseIds)
  const featuredCourses = [2, 3, 4]
    .map((position) => {
      const positionedCourse = curatedByPosition.get(position)
      if (positionedCourse && !usedFeaturedCourseIds.has(positionedCourse.id)) {
        usedFeaturedCourseIds.add(positionedCourse.id)
        return positionedCourse
      }

      return takeNextUnusedCourse(fallbackPool, usedFeaturedCourseIds)
    })
    .filter((course): course is PublishedCoursePreview => Boolean(course))
  const latestPosts = (postsResult.data ?? []) as Post[]
  const upcomingEvents = (eventsResult.data ?? []) as Event[]
  const galleryItems = (galleryResult.data ?? []) as GalleryItem[]
  const postsImagesMap = await getPostImagesMap(
    supabase,
    latestPosts.map((post) => post.id)
  )
  const upcomingImagesMap = await getEventImagesMap(
    supabase,
    upcomingEvents.map((event) => event.id)
  )

  return {
    heroCourse,
    featuredCourses,
    latestPosts: mergePostsWithImages(latestPosts, postsImagesMap),
    upcomingEvents: mergeEventsWithImages(upcomingEvents, upcomingImagesMap),
    galleryPreview: galleryItems.slice(0, 6),
    categoryShowcase: {
      baile: galleryItems.find((item) => item.category === "baile") ?? null,
      tatuaje: galleryItems.find((item) => item.category === "tatuaje") ?? null,
    },
    publishedCoursesCount: coursesCountResult.count ?? 0,
  }
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
