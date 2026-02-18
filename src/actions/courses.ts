"use server"

export async function getCourses(filters?: {
  category?: string
  search?: string
}) {
  // TODO: Query Supabase courses table with filters
  console.log("getCourses", filters)
  return []
}

export async function getCourseBySlug(slug: string) {
  // TODO: Query course with modules, lessons, instructor, reviews
  console.log("getCourseBySlug", slug)
  return null
}
