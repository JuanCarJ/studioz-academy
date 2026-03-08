import type { MetadataRoute } from "next"

import { createServiceRoleClient } from "@/lib/supabase/admin"
import { env } from "@/lib/env"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServiceRoleClient()
  const baseUrl = env.APP_URL()

  const [courses, posts, events, instructors] = await Promise.all([
    supabase
      .from("courses")
      .select("slug, updated_at")
      .eq("is_published", true),
    supabase
      .from("posts")
      .select("slug, updated_at")
      .eq("is_published", true),
    supabase
      .from("events")
      .select("id, updated_at")
      .eq("is_published", true),
    supabase
      .from("instructors")
      .select("slug, updated_at")
      .eq("is_active", true),
  ])

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, priority: 1, changeFrequency: "daily" },
    { url: `${baseUrl}/cursos`, priority: 0.9, changeFrequency: "daily" },
    { url: `${baseUrl}/servicios`, priority: 0.8, changeFrequency: "weekly" },
    { url: `${baseUrl}/galeria`, priority: 0.7, changeFrequency: "weekly" },
    { url: `${baseUrl}/noticias`, priority: 0.8, changeFrequency: "daily" },
    { url: `${baseUrl}/eventos`, priority: 0.8, changeFrequency: "daily" },
    { url: `${baseUrl}/contacto`, priority: 0.7, changeFrequency: "monthly" },
    {
      url: `${baseUrl}/politica-de-privacidad`,
      priority: 0.3,
      changeFrequency: "yearly",
    },
    {
      url: `${baseUrl}/terminos`,
      priority: 0.3,
      changeFrequency: "yearly",
    },
    {
      url: `${baseUrl}/politica-de-reembolso`,
      priority: 0.3,
      changeFrequency: "yearly",
    },
  ]

  const courseRoutes: MetadataRoute.Sitemap = (courses.data ?? []).map(
    (course) => ({
      url: `${baseUrl}/cursos/${course.slug}`,
      lastModified: course.updated_at,
      priority: 0.8,
      changeFrequency: "weekly",
    })
  )

  const postRoutes: MetadataRoute.Sitemap = (posts.data ?? []).map((post) => ({
    url: `${baseUrl}/noticias/${post.slug}`,
    lastModified: post.updated_at,
    priority: 0.7,
    changeFrequency: "weekly",
  }))

  const eventRoutes: MetadataRoute.Sitemap = (events.data ?? []).map(
    (event) => ({
      url: `${baseUrl}/eventos#${event.id}`,
      lastModified: event.updated_at,
      priority: 0.5,
      changeFrequency: "weekly",
    })
  )

  const instructorRoutes: MetadataRoute.Sitemap = (
    instructors.data ?? []
  ).map((instructor) => ({
    url: `${baseUrl}/instructores/${instructor.slug}`,
    lastModified: instructor.updated_at,
    priority: 0.6,
    changeFrequency: "monthly",
  }))

  return [
    ...staticRoutes,
    ...courseRoutes,
    ...postRoutes,
    ...eventRoutes,
    ...instructorRoutes,
  ]
}
