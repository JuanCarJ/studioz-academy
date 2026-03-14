import Link from "next/link"

import { getAdminDashboardData } from "@/actions/admin/dashboard"
import { formatCOP } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function AdminDashboardPage() {
  const data = await getAdminDashboardData()

  const topCards = [
    {
      label: "Ingresos aprobados",
      value: formatCOP(data.sales.totalRevenue),
      description: `${data.sales.totalOrders} ordenes aprobadas`,
    },
    {
      label: "Ordenes pendientes",
      value: data.metrics.pendingOrders.toLocaleString("es-CO"),
      description: "Requieren monitoreo o conciliacion",
    },
    {
      label: "Descuentos otorgados",
      value: formatCOP(data.sales.totalDiscountGiven),
      description: data.sales.topPaymentMethod
        ? `Metodo mas usado: ${data.sales.topPaymentMethod}`
        : "Sin metodo dominante",
    },
    {
      label: "Mensajes por revisar",
      value: data.metrics.unreadContacts.toLocaleString("es-CO"),
      description: "Entradas sin marcar como leidas",
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
      label: "Imagenes en galeria",
      value: data.metrics.galleryItems,
      href: "/admin/galeria",
    },
  ]

  const quickLinks = [
    { href: "/admin/cursos", label: "Gestionar cursos" },
    { href: "/admin/ventas", label: "Revisar ventas" },
    { href: "/admin/combos", label: "Editar combos" },
    { href: "/admin/auditoria", label: "Ver auditoria" },
  ]

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Panel de administracion</h1>
          <p className="mt-2 text-muted-foreground">
            Vista operativa de ventas, contenido, auditoria y soporte.
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
            <CardTitle>Ultimas ordenes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.recentOrders.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hay ordenes registradas.
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
                  <p className="mt-1 text-sm font-medium">{order.status}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString("es-CO")}
                  </p>
                </div>
                <p className="text-sm font-semibold">{formatCOP(order.total)}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actividad de auditoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.recentAuditLogs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aun no hay eventos de auditoria.
              </p>
            )}
            {data.recentAuditLogs.map((log) => (
              <div key={log.id} className="rounded-xl border p-4">
                <p className="text-sm font-medium">{log.action}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {log.entity_type}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString("es-CO")} ·{" "}
                  {log.result}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
