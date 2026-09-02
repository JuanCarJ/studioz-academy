import { Suspense } from "react"

import type { Metadata } from "next"

import { getCourses, getCatalogUserState, getInstructorsForFilter } from "@/actions/courses"
import { CatalogFilters } from "@/components/courses/CatalogFilters"
import { CourseGrid } from "@/components/courses/CourseGrid"
import { CoursesSkeleton } from "@/components/skeletons/CoursesSkeleton"
import { CatalogPagination } from "@/components/courses/CatalogPagination"
import { normalizeCatalogFilters, type CatalogFilters as Filters, type CatalogQuery } from "@/lib/catalog"

const CATEGORY_LABELS: Record<string, string> = {
  baile: "Baile",
  tatuaje: "Tatuaje",
}

interface PageProps {
  searchParams: Promise<CatalogQuery>
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const sp = normalizeCatalogFilters(await searchParams)
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
  filters: Filters
}) {
  const result = await getCourses(filters)
  const userState = await getCatalogUserState(result.courses.map((course) => course.id))

  return (
    <>
    {result.total > 0 && <p className="mb-4 text-sm text-muted-foreground" role="status">
      {(result.page - 1) * result.pageSize + 1}–{Math.min(result.page * result.pageSize, result.total)} de {result.total} cursos
    </p>}
    <CourseGrid
      courses={result.courses}
      cartCourseIds={userState.cartCourseIds}
      enrolledCourseIds={userState.enrolledCourseIds}
      isAuthenticated={userState.isAuthenticated}
    />
    <CatalogPagination filters={filters} page={result.page} pageSize={result.pageSize} total={result.total} />
    </>
  )
}

export default async function CourseCatalogPage({ searchParams }: PageProps) {
  const filters = normalizeCatalogFilters(await searchParams)
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
        <Suspense key={JSON.stringify(filters)} fallback={<CoursesSkeleton />}>
          <CourseResults filters={filters} />
        </Suspense>
      </div>
    </section>
  )
}
