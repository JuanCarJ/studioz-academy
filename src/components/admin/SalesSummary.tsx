import { getSalesSummary } from "@/actions/admin/orders"
import { formatCOP } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export async function SalesSummary() {
  const summary = await getSalesSummary()

  const stats = [
    {
      label: "Total ventas aprobadas",
      value: summary.totalOrders.toLocaleString("es-CO"),
      description: "ordenes con estado aprobado",
    },
    {
      label: "Ingresos totales",
      value: formatCOP(summary.totalRevenue),
      description: "suma de ordenes aprobadas",
    },
    {
      label: "Ticket promedio",
      value: formatCOP(summary.averageOrderValue),
      description: "por orden aprobada",
    },
    {
      label: "Descuentos otorgados",
      value: formatCOP(summary.totalDiscountGiven),
      description: summary.topPaymentMethod
        ? `Metodo mas usado: ${summary.topPaymentMethod}`
        : "sin descuentos aplicados",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
