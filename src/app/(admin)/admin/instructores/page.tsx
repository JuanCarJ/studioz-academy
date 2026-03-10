import { Suspense } from "react"
import Link from "next/link"

import { getInstructors } from "@/actions/admin/instructors"
import { InstructorForm } from "@/components/admin/InstructorForm"
import { AdminTableSkeleton } from "@/components/skeletons/AdminTableSkeleton"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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

export const metadata = { title: "Instructores — Admin | Studio Z" }

async function InstructorsList() {
  const instructors = await getInstructors()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Foto</TableHead>
          <TableHead>Nombre</TableHead>
          <TableHead>Especialidades</TableHead>
          <TableHead>Experiencia</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="w-24">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {instructors.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              No hay instructores registrados.
            </TableCell>
          </TableRow>
        )}
        {instructors.map((inst) => (
          <TableRow key={inst.id}>
            <TableCell>
              <Avatar className="h-8 w-8">
                <AvatarImage src={inst.avatar_url ?? undefined} alt={inst.full_name} className="object-cover" />
                <AvatarFallback className="bg-muted text-xs font-bold text-muted-foreground">
                  {inst.full_name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </TableCell>
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
            <TableCell>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/admin/instructores/${inst.id}/editar`}>
                  Editar
                </Link>
              </Button>
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
