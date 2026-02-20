import { Suspense } from "react"

import { getOrders } from "@/actions/admin/orders"
import { SalesSummary } from "@/components/admin/SalesSummary"
import { OrdersTable } from "@/components/admin/OrdersTable"
import { OrdersFilters } from "@/components/admin/OrdersFilters"
import { AdminPagination } from "@/components/admin/AdminPagination"


export const metadata = { title: "Ventas — Admin | Studio Z" }

// Summary cards skeleton
function SalesSummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-lg border bg-muted"
        />
      ))}
    </div>
  )
}

interface PageProps {
  searchParams: Promise<{
    status?: string
    dateFrom?: string
    dateTo?: string
    search?: string
    paymentMethod?: string
    combo?: string
    page?: string
  }>
}

export default async function AdminSalesPage({ searchParams }: PageProps) {
  const params = await searchParams

  const status = params.status ?? "all"
  const dateFrom = params.dateFrom ?? ""
  const dateTo = params.dateTo ?? ""
  const search = params.search ?? ""
  const paymentMethod = params.paymentMethod ?? "all"
  const combo = params.combo ?? "all"
  const page = Math.max(1, parseInt(params.page ?? "1", 10))

  const result = await getOrders({
    status: status !== "all" ? status : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: search || undefined,
    paymentMethod: paymentMethod !== "all" ? paymentMethod : undefined,
    combo: combo !== "all" ? combo : undefined,
    page,
  })

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Ventas</h1>
        <p className="mt-2 text-muted-foreground">
          Historial de ordenes y transacciones.
        </p>
      </div>

      <Suspense fallback={<SalesSummarySkeleton />}>
        <SalesSummary />
      </Suspense>

      <div className="space-y-4">
        <OrdersFilters
          status={status}
          dateFrom={dateFrom}
          dateTo={dateTo}
          search={search}
          paymentMethod={paymentMethod}
          combo={combo}
        />

        <div className="overflow-x-auto rounded-lg border">
          <OrdersTable orders={result.orders} />
        </div>

        <AdminPagination
          page={result.page}
          totalCount={result.totalCount}
          pageSize={result.pageSize}
        />
      </div>
    </section>
  )
}
