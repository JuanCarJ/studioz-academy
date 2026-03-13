import Link from "next/link"

import { getUsers } from "@/actions/admin/users"
import { UsersFilters } from "@/components/admin/UsersFilters"
import { AdminPagination } from "@/components/admin/AdminPagination"
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

export const metadata = { title: "Usuarios — Admin | Studio Z" }

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

interface PageProps {
  searchParams: Promise<{
    search?: string
    page?: string
  }>
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const params = await searchParams
  const search = params.search ?? ""
  const page = Math.max(1, parseInt(params.page ?? "1", 10))

  const result = await getUsers({ search: search || undefined, page })

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Usuarios</h1>
        <p className="mt-2 text-muted-foreground">
          Listado de usuarios registrados en la plataforma.
        </p>
      </div>

      <UsersFilters search={search} />

      {result.users.length === 0 ? (
        <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
          No se encontraron usuarios.
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {result.users.map((user) => (
              <div key={user.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{user.full_name}</p>
                    <p className="break-all text-sm text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                  <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                    {user.role === "admin" ? "Admin" : "Usuario"}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 text-sm min-[420px]:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Telefono
                    </p>
                    <p className="mt-1">{user.phone ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Ultimo ingreso
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {formatDate(user.last_login_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Registro
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {formatDate(user.created_at)}
                    </p>
                  </div>
                </div>

                <Button variant="outline" className="mt-4 w-full" asChild>
                  <Link href={`/admin/usuarios/${user.id}`}>Ver ficha</Link>
                </Button>
              </div>
            ))}
          </div>

          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Ultimo ingreso</TableHead>
                  <TableHead>Registro</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name}</TableCell>
                    <TableCell className="text-sm">{user.email}</TableCell>
                    <TableCell className="text-sm">{user.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                        {user.role === "admin" ? "Admin" : "Usuario"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(user.last_login_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/usuarios/${user.id}`}>Ver ficha</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <AdminPagination
        page={result.page}
        totalCount={result.totalCount}
        pageSize={result.pageSize}
      />
    </section>
  )
}
