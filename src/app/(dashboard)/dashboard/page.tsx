import Link from "next/link"
import { BookOpen, CheckCircle2, PlayCircle } from "lucide-react"

import { getEnrolledCoursesWithProgress } from "@/actions/progress"
import { EnrolledCourseCard } from "@/components/dashboard/EnrolledCourseCard"
import { CourseSortSelect } from "@/components/dashboard/CourseSortSelect"
import { Button } from "@/components/ui/button"

import type { EnrolledCourseWithProgress } from "@/actions/progress"

type SortKey = "lastAccessed" | "progressDesc" | "progressAsc" | "enrolledAt"

function isValidSort(value: string | undefined): value is SortKey {
  return (
    value === "lastAccessed" ||
    value === "progressDesc" ||
    value === "progressAsc" ||
    value === "enrolledAt"
  )
}

function sortCourses(
  courses: EnrolledCourseWithProgress[],
  sort: SortKey
): EnrolledCourseWithProgress[] {
  const sorted = [...courses]

  switch (sort) {
    case "lastAccessed":
      return sorted.sort(
        (a, b) =>
          new Date(b.progress.lastAccessedAt).getTime() -
          new Date(a.progress.lastAccessedAt).getTime()
      )
    case "progressDesc":
      return sorted.sort((a, b) => b.progress.percentage - a.progress.percentage)
    case "progressAsc":
      return sorted.sort((a, b) => a.progress.percentage - b.progress.percentage)
    case "enrolledAt":
      return sorted.sort(
        (a, b) =>
          new Date(b.enrolledAt).getTime() - new Date(a.enrolledAt).getTime()
      )
    default:
      return sorted
  }
}

interface DashboardPageProps {
  searchParams: Promise<{ sort?: string }>
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const resolvedParams = await searchParams
  const rawSort = resolvedParams.sort
  const activeSort: SortKey = isValidSort(rawSort) ? rawSort : "lastAccessed"

  const { courses, error } = await getEnrolledCoursesWithProgress()

  const sortedCourses = sortCourses(courses, activeSort)

  // Compute quick stats
  const totalCourses = courses.length
  const completedCourses = courses.filter((c) => c.progress.isCompleted).length
  const inProgressCourses = courses.filter(
    (c) => c.progress.percentage > 0 && !c.progress.isCompleted
  ).length

  return (
    <section className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mi aprendizaje</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalCourses === 0
              ? "Aun no tienes cursos inscritos"
              : totalCourses === 1
                ? "1 curso inscrito"
                : `${totalCourses} cursos inscritos`}
          </p>
        </div>
        {totalCourses > 1 && (
          <CourseSortSelect currentSort={activeSort} />
        )}
      </div>

      {/* Quick stats row */}
      {totalCourses > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-lg border bg-card p-3 sm:p-4 space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Total
            </p>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xl font-bold">{totalCourses}</span>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3 sm:p-4 space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Completados
            </p>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              <span className="text-xl font-bold">{completedCourses}</span>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3 sm:p-4 space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              En progreso
            </p>
            <div className="flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-xl font-bold">{inProgressCourses}</span>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && error !== "AUTH_REQUIRED" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">
            Hubo un error al cargar tus cursos. Por favor recarga la pagina.
          </p>
        </div>
      )}

      {/* Empty state */}
      {totalCourses === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 py-16 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">Aun no tienes cursos</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">
            Explora el catalogo y comienza tu aprendizaje en baile o tatuaje.
          </p>
          <Button asChild className="mt-6">
            <Link href="/cursos">Explorar cursos</Link>
          </Button>
        </div>
      )}

      {/* Course grid */}
      {sortedCourses.length > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sortedCourses.map((item) => (
            <EnrolledCourseCard key={item.course.id} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}
