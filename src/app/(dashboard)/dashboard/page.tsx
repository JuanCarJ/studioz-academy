import Link from "next/link"
import { BookOpen } from "lucide-react"
import { getEnrolledCoursesWithProgress } from "@/actions/progress"
import { EnrolledCourseCard } from "@/components/dashboard/EnrolledCourseCard"
import { CourseSortSelect } from "@/components/dashboard/CourseSortSelect"
import { StudentPagination } from "@/components/dashboard/StudentPagination"
import { Button } from "@/components/ui/button"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; filter?: string; page?: string }>
}) {
  const params = await searchParams
  const sort = ["lastAccessed", "progressDesc", "progressAsc", "enrolledAt"].includes(params.sort ?? "") ? params.sort! : "lastAccessed"
  const filter = ["active", "completed"].includes(params.filter ?? "") ? params.filter! : "all"
  const result = await getEnrolledCoursesWithProgress({ sort, filter, page: Number(params.page ?? 1) })
  const { courses, error, totalCourses, completedCourses, total, page, pageSize } = result
  const filters = [
    { value: "all", label: "Todos", count: totalCourses },
    { value: "active", label: "Por completar", count: totalCourses - completedCourses },
    { value: "completed", label: "Completados", count: completedCourses },
  ]

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Mi aprendizaje</h1>
        {totalCourses > 1 && <CourseSortSelect currentSort={sort} />}
      </div>

      {totalCourses > 0 && !error && (
        <nav aria-label="Filtrar cursos" className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <Button key={item.value} asChild variant={filter === item.value ? "default" : "outline"} className="min-h-11">
              <Link href={`/dashboard?${new URLSearchParams({ filter: item.value, sort })}`} aria-current={filter === item.value ? "page" : undefined}>
                {item.label} ({item.count})
              </Link>
            </Button>
          ))}
        </nav>
      )}

      {error && (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm">{error === "AUTH_REQUIRED" ? "Inicia sesión de nuevo para ver tus cursos." : error}</p>
          <Button asChild variant="outline">
            <Link href={error === "AUTH_REQUIRED" ? "/login?redirect=%2Fdashboard" : "/dashboard"}>{error === "AUTH_REQUIRED" ? "Iniciar sesión" : "Volver a intentar"}</Link>
          </Button>
        </div>
      )}

      {!error && courses.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 px-6 py-16 text-center">
          <BookOpen className="mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold">
            {totalCourses === 0 ? "Aún no tienes cursos" : filter === "completed" ? "Aún no has completado un curso" : filter === "active" && total === 0 ? "¡Completaste todos tus cursos!" : "No hay cursos en esta página"}
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {totalCourses === 0 ? "Encuentra tu próximo curso de baile o tatuaje y aprende a tu ritmo." : "Puedes volver a todos tus cursos para continuar o repasar."}
          </p>
          <Button asChild className="mt-6">
            <Link href={totalCourses === 0 ? "/cursos" : "/dashboard"}>{totalCourses === 0 ? "Explorar cursos" : "Ver todos mis cursos"}</Link>
          </Button>
        </div>
      )}

      {courses.length > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((item) => <EnrolledCourseCard key={item.course.id} item={item} />)}
        </div>
      )}
      {!error && <StudentPagination pathname="/dashboard" page={page} pageSize={pageSize} total={total} query={{ sort, filter }} />}
    </section>
  )
}
