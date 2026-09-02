import Link from "next/link"
import { getPendingAccountCleanups } from "@/actions/admin/account-cleanup"
import { StudentPagination } from "@/components/dashboard/StudentPagination"
import { Button } from "@/components/ui/button"

export const metadata = { title: "Eliminaciones pendientes — Admin | Studio Z" }

export default async function PendingAccountCleanupsPage({ searchParams }: {
  searchParams: Promise<{ page?: string }>
}) {
  const query = await searchParams
  const result = await getPendingAccountCleanups(Number(query.page))
  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-3xl font-bold">Eliminaciones pendientes</h1>
        <p className="mt-2 text-muted-foreground">Estas cuentas ya están desactivadas. Revisa la ficha para completar su eliminación de acceso.</p></div>
      <Button variant="outline" asChild><Link href="/admin/usuarios">Volver a usuarios</Link></Button>
    </div>
    <p className="text-sm">{result.totalCount} solicitudes pendientes.</p>
    {result.items.length === 0 ? <p className="rounded-xl border p-5">No hay eliminaciones de acceso pendientes.</p> :
      <ul className="space-y-3">{result.items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <div><p className="font-medium">Cuenta desactivada</p>
          <p className="text-sm text-muted-foreground">Solicitud: {new Date(item.deleted_at!).toLocaleString("es-CO", { timeZone: "America/Bogota" })} · Intentos: {item.auth_cleanup_attempts}</p></div>
        <Button variant="outline" asChild><Link href={`/admin/usuarios/${item.id}`}>Revisar solicitud</Link></Button>
      </li>)}</ul>}
    <StudentPagination pathname="/admin/usuarios/eliminaciones" page={result.page} pageSize={result.pageSize} total={result.totalCount} />
  </section>
}
