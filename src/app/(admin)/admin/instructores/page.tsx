import { Suspense } from "react"

import { getInstructors } from "@/actions/admin/instructors"
import { InstructorForm } from "@/components/admin/InstructorForm"
import { AdminTableSkeleton } from "@/components/skeletons/AdminTableSkeleton"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const metadata = { title: "Instructores — Admin | Studio Z" }

async function InstructorsList() {
  const instructors = await getInstructors()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Especialidades</TableHead>
          <TableHead>Experiencia</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {instructors.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground">
              No hay instructores registrados.
            </TableCell>
          </TableRow>
        )}
        {instructors.map((inst) => (
          <TableRow key={inst.id}>
            <TableCell className="font-medium">{inst.full_name}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {inst.specialties.map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell>
              {inst.years_experience != null
                ? `${inst.years_experience} anos`
                : "—"}
            </TableCell>
            <TableCell>
              <Badge variant={inst.is_active ? "default" : "secondary"}>
                {inst.is_active ? "Activo" : "Inactivo"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default function AdminInstructorsPage() {
  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Instructores</h1>
        <p className="mt-2 text-muted-foreground">
          Gestiona los instructores de la academia.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-4 text-lg font-semibold">Nuevo instructor</h2>
          <InstructorForm />
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold">Instructores registrados</h2>
          <Suspense fallback={<AdminTableSkeleton />}>
            <InstructorsList />
          </Suspense>
        </div>
      </div>
    </section>
  )
}
