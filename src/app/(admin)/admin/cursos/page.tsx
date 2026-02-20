import { Suspense } from "react"
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

async function CoursesTable() {
  const courses = await getAdminCourses()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Titulo</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead>Instructor</TableHead>
          <TableHead>Precio</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Inscritos</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {courses.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground">
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
                {course.is_published ? "Publicado" : "Borrador"}
              </Badge>
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
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default function AdminCoursesPage() {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestion de cursos</h1>
          <p className="mt-2 text-muted-foreground">
            Listado de todos los cursos.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/cursos/nuevo">Crear curso</Link>
        </Button>
      </div>

      <Suspense fallback={<AdminTableSkeleton />}>
        <CoursesTable />
      </Suspense>
    </section>
  )
}
