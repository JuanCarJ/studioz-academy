import { Suspense } from "react"

import type { Metadata } from "next"

import { getCourses, getInstructorsForFilter } from "@/actions/courses"
import { CatalogFilters } from "@/components/courses/CatalogFilters"
import { CourseGrid } from "@/components/courses/CourseGrid"
import { CoursesSkeleton } from "@/components/skeletons/CoursesSkeleton"

const CATEGORY_LABELS: Record<string, string> = {
  baile: "Baile",
  tatuaje: "Tatuaje",
}

interface PageProps {
  searchParams: Promise<{
    category?: string
    search?: string
    sort?: string
    instructor?: string
  }>
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const sp = await searchParams
  const categoryLabel = sp.category ? CATEGORY_LABELS[sp.category] : null

  return {
    title: categoryLabel
      ? `Cursos de ${categoryLabel} — Studio Z Academy`
      : "Cursos — Studio Z Academy",
    description: categoryLabel
      ? `Explora nuestros cursos de ${categoryLabel.toLowerCase()} online.`
      : "Explora nuestro catalogo completo de cursos de baile y tatuaje.",
  }
}

async function CourseResults({
  filters,
}: {
  filters: {
    category?: string
    search?: string
    sort?: string
    instructor?: string
  }
}) {
  const courses = await getCourses({
    category: filters.category,
    search: filters.search,
    sort: (filters.sort as "newest" | "price_asc" | "price_desc") ?? "newest",
    instructor: filters.instructor,
  })

  return <CourseGrid courses={courses} />
}

export default async function CourseCatalogPage({ searchParams }: PageProps) {
  const filters = await searchParams
  const categoryLabel = filters.category
    ? CATEGORY_LABELS[filters.category]
    : null

  // H-05: Fetch instructors for filter dropdown
  const instructors = await getInstructorsForFilter()

  return (
    <section className="container mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          {categoryLabel ? `Cursos de ${categoryLabel}` : "Cursos"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {categoryLabel
            ? `Explora nuestros cursos de ${categoryLabel.toLowerCase()}.`
            : "Explora nuestro catalogo completo de cursos."}
        </p>
      </div>

      <CatalogFilters instructors={instructors} />

      <div className="mt-8">
        <Suspense fallback={<CoursesSkeleton />}>
          <CourseResults filters={filters} />
        </Suspense>
      </div>
    </section>
  )
}
