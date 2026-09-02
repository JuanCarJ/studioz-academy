import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { catalogHref, decodeCatalogPage, normalizeCatalogFilters, type CatalogCourseRow } from "@/lib/catalog"

const course: CatalogCourseRow = {
  id: "course-a", title: "Salsa", slug: "salsa", short_description: "Baila", category: "baile",
  price: 100_000, is_free: false, thumbnail_url: null, rating_avg: 5, reviews_count: 1,
  course_discount_enabled: true, course_discount_type: "percentage", course_discount_value: 20,
  published_at: "2026-01-01T00:00:00Z", instructor_id: "instructor-a",
  instructor: { id: "instructor-a", full_name: "Ana" },
}

describe("catalog filters and page contract", () => {
  it("normalizes hostile/invalid query values", () => {
    expect(normalizeCatalogFilters({ category: "all", instructor: "a),id.not.is.null", sort: "drop", page: "-2", search: ["x", "y"] }))
      .toEqual({ category: "", instructor: "", sort: "newest", page: 1, search: "" })
  })
  it("preserves punctuation as literal bound search text", () => {
    expect(normalizeCatalogFilters({ search: "  Ana, (50%_OFF)  " }).search).toBe("Ana, (50%_OFF)")
  })
  it("bounds long search input and huge pages", () => {
    const normalized = normalizeCatalogFilters({ search: "x".repeat(300), page: 1_000_000_000 })
    expect(normalized.search).toHaveLength(120)
    expect(normalized.page).toBe(1_000_000)
  })
  it("keeps category/search/instructor/sort between pages", () => {
    const instructor = "11111111-1111-4111-8111-111111111111"
    const href = catalogHref({ category: "baile", search: "salsa & bachata", instructor, sort: "price_desc" }, 3)
    const url = new URL(href, "http://localhost")
    expect(Object.fromEntries(url.searchParams)).toEqual({ category: "baile", search: "salsa & bachata", instructor, sort: "price_desc", page: "3" })
    expect(catalogHref({ category: "baile", page: 4 })).toBe("/cursos?category=baile")
  })
  it("decorates the bounded SQL page without reordering commercial list-price results", () => {
    const data = decodeCatalogPage({ items: [course], total: 37, page: 2, page_size: 12 })
    expect(data).toMatchObject({ total: 37, page: 2, pageSize: 12 })
    expect(data.courses[0]).toMatchObject({ price: 100_000, list_price: 100_000, current_price: 80_000, course_discount_amount: 20_000 })
  })
  it("returns a real empty page, but rejects missing/oversized/malformed payloads", () => {
    expect(decodeCatalogPage({ items: [], total: 0, page: 1, page_size: 12 }).courses).toEqual([])
    for (const data of [null, {}, { items: [], total: -1, page: 1, page_size: 12 }, { items: Array(13).fill(course), total: 13, page: 1, page_size: 12 }]) {
      expect(() => decodeCatalogPage(data)).toThrow("catalog_unavailable")
    }
  })
})

describe("catalog SQL contract (not SQL execution)", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260902000600_public_catalog_pagination.sql", import.meta.url), "utf8")
  it("filters and counts before server-side pagination with stable ties", () => {
    expect(sql).toContain("c.is_published AND c.archived_at IS NULL")
    expect(sql).toContain("SELECT count(*) AS total FROM matching")
    expect(sql).toContain("LIMIT v_size OFFSET")
    expect(sql).toContain("m.id ASC")
    expect(sql).toContain("m.price END ASC")
    expect(sql).toContain("m.price END DESC")
  })
  it("keeps substring search literal and indexes the three searchable fields", () => {
    expect(sql).toContain("'%', chr(92) || '%'")
    expect(sql).toContain("'_', chr(92) || '_'")
    expect(sql).toContain("c.title ILIKE v_pattern")
    expect(sql).toContain("c.short_description ILIKE v_pattern")
    expect(sql).toContain("si.full_name ILIKE v_pattern")
    expect(sql).toContain("catalog_title_search")
    expect(sql).toContain("catalog_description_search")
    expect(sql).toContain("catalog_instructor_search")
  })
  it("returns only public card fields, not protected media metadata", () => {
    expect(sql).not.toContain("bunny_video_id")
    expect(sql).toContain("FROM PUBLIC, anon, authenticated")
    expect(sql).toContain("TO service_role")
  })
})
