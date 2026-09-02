import Link from "next/link"
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
} from "@/lib/admin-review-audit"

import { getAdminDashboardData } from "@/actions/admin/dashboard"
import { formatCOP } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ dateFrom?: string; dateTo?: string }>
}) {
  const query = await searchParams
  const dateFrom =
    query.dateFrom ??
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(
      new Date(new Date().getTime() - 30 * 86400000)
    )
  const dateTo =
    query.dateTo ??
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(
      new Date()
    )
  const data = await getAdminDashboardData({ dateFrom, dateTo })
  const statuses: Record<string, string> = {
    pending: "Pendiente",
    approved: "Aprobada",
    declined: "No aprobada",
    voided: "Cancelada",
    refunded: "Reembolsada",
    chargeback: "Contracargo",
  }
  const queues = [
    {
      label: "Pagos pendientes por más de 30 minutos",
      value: data.queues.stalePayments,
      href: "/admin/ventas?status=pending",
    },
    {
      label: "Confirmaciones de compra sin enviar",
      value: data.queues.failedEmails,
      href: "/admin/ventas",
    },
    {
      label: "Notificaciones de pago por revisar",
      value: data.queues.unprocessedNotifications,
      href: "/admin/ventas",
    },
    {
      label: "Videos con problemas",
      value: data.queues.videoIssues,
      href: "/admin/videos",
    },
  ]

  const topCards = [
    {
      label: "Ingresos aprobados",
      value: formatCOP(data.sales.totalRevenue),
      description: `${data.sales.totalOrders} compras aprobadas`,
    },
    {
      label: "Compras pendientes",
      value: data.metrics.pendingOrders.toLocaleString("es-CO"),
      description: "Estado de pagos aún sin confirmar · todos los periodos",
    },
    {
      label: "Descuentos otorgados",
      value: formatCOP(data.sales.totalDiscountGiven),
      description: data.sales.topPaymentMethod
        ? `Método más usado: ${data.sales.topPaymentMethod}`
        : "Sin pagos registrados",
    },
    {
      label: "Mensajes por revisar",
      value: data.metrics.unreadContacts.toLocaleString("es-CO"),
      description: "Mensajes que aún no están resueltos",
    },
  ]

  const contentCards = [
    {
      label: "Cursos publicados",
      value: data.metrics.publishedCourses,
      href: "/admin/cursos",
    },
    {
      label: "Eventos activos",
      value: data.metrics.publishedEvents,
      href: "/admin/eventos",
    },
    {
      label: "Imágenes en galería",
      value: data.metrics.galleryItems,
      href: "/admin/galeria",
    },
  ]

  const quickLinks = [
    { href: "/admin/cursos", label: "Gestionar cursos" },
    { href: "/admin/ventas", label: "Revisar ventas" },
    { href: "/admin/combos", label: "Editar combos" },
    { href: "/admin/auditoria", label: "Ver auditoría" },
  ]

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Panel de administración</h1>
          <p className="mt-2 text-muted-foreground">
            Vista operativa de ventas, contenido, auditoría y soporte.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickLinks.map((link) => (
            <Button key={link.href} asChild variant="outline">
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Ventas desde
          <input
            className="ml-2 rounded border p-2"
            type="date"
            name="dateFrom"
            defaultValue={dateFrom}
          />
        </label>
        <label className="text-sm">
          Hasta
          <input
            className="ml-2 rounded border p-2"
            type="date"
            name="dateTo"
            defaultValue={dateTo}
          />
        </label>
        <Button type="submit" variant="outline">
          Aplicar fechas
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          Fechas de Colombia. Ingresos y descuentos: compras creadas en este
          periodo y actualmente aprobadas.
        </p>
      </form>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {topCards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tracking-tight">{card.value}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section aria-labelledby="pending-title" className="space-y-3">
        <h2 id="pending-title" className="text-xl font-semibold">
          Requiere atención
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {queues.map((queue) => (
            <Link
              key={queue.label}
              href={queue.href}
              className="rounded-xl border p-4 hover:border-primary"
            >
              <p className="text-sm">{queue.label}</p>
              <p className="mt-2 text-2xl font-semibold">{queue.value}</p>
            </Link>
          ))}
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {contentCards.map((card) => (
          <Link key={card.href} href={card.href} className="block">
            <Card className="h-full transition-transform hover:-translate-y-1">
              <CardContent className="space-y-2 pt-6">
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="text-3xl font-bold">{card.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Últimas compras</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.recentOrders.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hay compras registradas.
              </p>
            )}
            {data.recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
              >
                <div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {order.reference}
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {statuses[order.status] ?? "En revisión"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString("es-CO", {
                      timeZone: "America/Bogota",
                    })}
                  </p>
                </div>
                <p className="text-sm font-semibold">
                  {formatCOP(order.total)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actividad de auditoría</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.recentAuditLogs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aún no hay eventos de auditoría.
              </p>
            )}
            {data.recentAuditLogs.map((log) => (
              <div key={log.id} className="rounded-xl border p-4">
                <p className="text-sm font-medium">
                  {AUDIT_ACTION_LABELS[log.action] ??
                    "Cambio de administración"}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {AUDIT_ENTITY_LABELS[log.entity_type] ?? "Registro"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString("es-CO", {
                    timeZone: "America/Bogota",
                  })}{" "}
                  · {log.result === "success" ? "Guardado" : "No completado"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
