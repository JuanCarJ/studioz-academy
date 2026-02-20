import { getSalesSummary } from "@/actions/admin/orders"
import { formatCOP } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  declined: "Rechazada",
  voided: "Anulada",
  refunded: "Reembolsada",
  chargeback: "Contracargo",
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  declined: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
  voided: "bg-gray-100 text-gray-600 dark:bg-gray-950/40 dark:text-gray-400",
  refunded: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
  chargeback: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
}

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

  const distributionEntries = Object.entries(summary.statusDistribution).sort(
    (a, b) => b[1] - a[1]
  )

  return (
    <div className="space-y-4">
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

      {distributionEntries.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Distribucion por estado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {distributionEntries.map(([status, count]) => (
                <Badge
                  key={status}
                  variant="outline"
                  className={`gap-1.5 px-3 py-1 ${STATUS_COLORS[status] ?? ""}`}
                >
                  {STATUS_LABELS[status] ?? status}
                  <span className="font-bold">{count}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
