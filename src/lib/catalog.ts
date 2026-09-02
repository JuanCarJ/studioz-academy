import { decorateCourseWithPricing } from "@/lib/pricing"
import type { Course, Instructor } from "@/types"

export const CATALOG_PAGE_SIZE = 12
export type CatalogQuery = {
  category?: string | string[]
  search?: string | string[]
  instructor?: string | string[]
  sort?: string | string[]
  page?: string | string[] | number
}
export type CatalogFilters = {
  category: "" | "baile" | "tatuaje"
  search: string
  instructor: string
  sort: "newest" | "price_asc" | "price_desc"
  page: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const text = (value: unknown) => typeof value === "string" ? value.trim() : ""

export function normalizeCatalogFilters(query: CatalogQuery = {}): CatalogFilters {
  const category = text(query.category)
  const instructor = text(query.instructor)
  const sort = text(query.sort)
  const page = Number(typeof query.page === "number" ? query.page : text(query.page))
  return {
    category: category === "baile" || category === "tatuaje" ? category : "",
    search: text(query.search).slice(0, 120),
    instructor: UUID.test(instructor) ? instructor : "",
    sort: sort === "price_asc" || sort === "price_desc" ? sort : "newest",
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1_000_000) : 1,
  }
}

export function catalogHref(query: CatalogQuery, page = 1): string {
  const filters = normalizeCatalogFilters({ ...query, page })
  const params = new URLSearchParams()
  if (filters.category) params.set("category", filters.category)
  if (filters.search) params.set("search", filters.search)
  if (filters.instructor) params.set("instructor", filters.instructor)
  if (filters.sort !== "newest") params.set("sort", filters.sort)
  if (filters.page > 1) params.set("page", String(filters.page))
  return `/cursos${params.size ? `?${params}` : ""}`
}

export type CatalogCourseRow = Pick<Course,
  "id" | "title" | "slug" | "short_description" | "category" | "price" | "is_free" |
  "thumbnail_url" | "rating_avg" | "reviews_count" | "course_discount_enabled" |
  "course_discount_type" | "course_discount_value" | "published_at" | "instructor_id"
> & { instructor: Pick<Instructor, "id" | "full_name"> }

export function decorateCatalogCourse(course: CatalogCourseRow) {
  const publishedTime = course.published_at ? new Date(course.published_at).getTime() : 0
  return {
    ...decorateCourseWithPricing(course),
    isNew: publishedTime > 0 && Date.now() - publishedTime < 30 * 24 * 60 * 60 * 1000,
  }
}

export type CatalogPage = {
  courses: ReturnType<typeof decorateCatalogCourse>[]
  total: number
  page: number
  pageSize: number
}

export function decodeCatalogPage(data: unknown): CatalogPage {
  if (!data || typeof data !== "object") throw new Error("catalog_unavailable")
  const result = data as { items?: CatalogCourseRow[]; total?: number; page?: number; page_size?: number }
  if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total) || result.total! < 0 ||
      !Number.isSafeInteger(result.page) || result.page! < 1 || result.page_size !== CATALOG_PAGE_SIZE ||
      result.items.length > CATALOG_PAGE_SIZE) throw new Error("catalog_unavailable")
  return {
    courses: result.items.map(decorateCatalogCourse), total: result.total!,
    page: result.page!, pageSize: CATALOG_PAGE_SIZE,
  }
}
