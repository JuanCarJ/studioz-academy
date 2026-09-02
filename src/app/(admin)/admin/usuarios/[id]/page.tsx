import Link from "next/link"
import { notFound } from "next/navigation"

import { OperationForm } from "@/components/admin/OperationForm"
import { AccountCleanupPanel } from "@/components/admin/AccountCleanupPanel"
import { AdminPagination } from "@/components/admin/AdminPagination"
import { getSupportNotes } from "@/actions/admin/operations"
import { getUserDetail } from "@/actions/admin/users"
import { UserDetailTabs } from "@/components/admin/UserDetailTabs"
import { Button } from "@/components/ui/button"

export const metadata = { title: "Ficha de usuario — Admin | Studio Z" }

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}

export default async function AdminUserDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params

  const query = await searchParams
  const [detail, notes] = await Promise.all([getUserDetail(id, Number(query.page)), getSupportNotes(id)])

  if (!detail) {
    notFound()
  }

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{detail.profile.full_name}</h1>
          <p className="mt-1 text-muted-foreground">{detail.profile.email}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/usuarios">Volver al listado</Link>
        </Button>
      </div>

      <p className="text-sm">{detail.profile.deleted_at ? "Cuenta desactivada por solicitud de eliminación" : detail.profile.suspended_at ? "Cuenta suspendida" : "Cuenta activa"}</p>
      {detail.profile.deleted_at && <AccountCleanupPanel userId={id} completedAt={detail.profile.auth_cleanup_completed_at} attempts={detail.profile.auth_cleanup_attempts} />}
      <UserDetailTabs detail={detail} />
      <AdminPagination {...detail.pagination} />
      <section className="max-w-2xl space-y-4 rounded-xl border p-5"><h2 className="text-xl font-semibold">Atención al estudiante</h2><p className="text-sm text-muted-foreground">Los cambios de acceso conservan las compras y el progreso. Restaurar requiere una compra aprobada.</p>
        <OperationForm targetId={id} operations={[
          { value: "user.note", label: "Añadir nota de soporte" },
          ...(!detail.profile.deleted_at && detail.profile.role !== "admin" ? [{ value: detail.profile.suspended_at ? "user.resume" : "user.suspend", label: detail.profile.suspended_at ? "Reactivar cuenta" : "Suspender cuenta" }] : []),
          ...(!detail.profile.deleted_at ? [{ value: "access.restore", label: "Restaurar acceso comprado" }, { value: "access.revoke", label: "Retirar acceso al curso" }, { value: "progress.reset", label: "Reiniciar progreso" }] : []),
        ]} courses={Array.from(new Map([...detail.enrollments.filter(e=>e.course).map(e=>({id:e.course_id,title:e.course!.title})),...detail.orders.flatMap(o=>o.items.filter(i=>i.course_id).map(i=>({id:i.course_id!,title:i.course_title_snapshot})))].map(c=>[c.id,c])).values())} />
        <h3 className="font-semibold">Notas recientes</h3>{notes.length === 0 ? <p className="text-sm">Aún no hay notas.</p> : <ul className="space-y-3">{notes.map(n=><li className="border-t pt-3" key={n.id}><p className="whitespace-pre-wrap">{n.note}</p><time className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("es-CO")}</time></li>)}</ul>}
      </section>
    </section>
  )
}
