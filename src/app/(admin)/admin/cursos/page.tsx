import { Suspense } from "react"
import { AdminPagination } from "@/components/admin/AdminPagination"
import { Input } from "@/components/ui/input"
import Link from "next/link"

import { getAdminCourses } from "@/actions/admin/courses"
import { AdminTableSkeleton } from "@/components/skeletons/AdminTableSkeleton"
import { DeleteCourseButton } from "@/components/admin/DeleteCourseButton"
import { formatCOP } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const metadata = { title: "Cursos — Admin | Studio Z" }

async function CoursesTable({ filters }: { filters: { search?: string; state?: string; page?: number } }) {
  const { courses, totalCount, page, error } = await getAdminCourses(filters)
  if (error) return <p role="alert">{error}</p>

  return (
    <><Table>
      <TableHeader>
        <TableRow>
          <TableHead>Título</TableHead>
          <TableHead>Categoría</TableHead>
          <TableHead>Instructor</TableHead>
          <TableHead>Precio</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Portada</TableHead>
          <TableHead>Inscritos</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {courses.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground">
              No hay cursos registrados.
            </TableCell>
          </TableRow>
        )}
        {courses.map((course) => (
          <TableRow key={course.id}>
            <TableCell className="max-w-[200px] truncate font-medium">
              {course.title}
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{course.category}</Badge>
            </TableCell>
            <TableCell>{course.instructor?.full_name ?? "—"}</TableCell>
            <TableCell>
              {course.is_free ? (
                <Badge variant="default">Gratis</Badge>
              ) : (
                formatCOP(course.price)
              )}
            </TableCell>
            <TableCell>
              <Badge variant={course.is_published ? "default" : "secondary"}>
                {course.archived_at ? "Archivado" : course.is_published ? "Publicado" : "Borrador"}
              </Badge>
            </TableCell>
            <TableCell>
              {course.home_featured_position ? (
                <Badge variant="outline">
                  {course.home_featured_position === 1
                    ? "Principal"
                    : `Posición ${course.home_featured_position}`}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">No</span>
              )}
            </TableCell>
            <TableCell>
              <span className="text-sm">{course.enrollment_count}</span>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/admin/cursos/${course.id}/editar`}>Editar</Link>
                </Button>
                <DeleteCourseButton
                  courseId={course.id}
                  courseTitle={course.title}
                  enrollmentCount={course.enrollment_count}
                  archived={Boolean(course.archived_at)}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table><AdminPagination page={page} totalCount={totalCount} pageSize={25} /></>
  )
}

export default async function AdminCoursesPage({ searchParams }: { searchParams: Promise<{ search?: string; state?: string; page?: string }> }) {
  const params = await searchParams
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión de cursos</h1>
          <p className="mt-2 text-muted-foreground">
            Listado de todos los cursos.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/cursos/nuevo">Crear curso</Link>
        </Button>
      </div>

      <form className="flex flex-wrap items-end gap-3"><div><label htmlFor="course-search">Buscar curso</label><Input id="course-search" name="search" defaultValue={params.search} maxLength={100} /></div><div><label className="block" htmlFor="course-state">Estado</label><select id="course-state" name="state" defaultValue={params.state} className="h-11 rounded-md border bg-background px-3"><option value="">Todos</option><option value="published">Publicados</option><option value="draft">Borradores</option><option value="archived">Archivados</option></select></div><Button className="min-h-11">Filtrar</Button></form>
      <Suspense fallback={<AdminTableSkeleton />}>
        <CoursesTable filters={{ search: params.search, state: params.state, page: Number(params.page) }} />
      </Suspense>
    </section>
  )
}
