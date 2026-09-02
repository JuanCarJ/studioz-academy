import Link from "next/link"
import { ShoppingBag } from "lucide-react"

import { getUserOrders } from "@/actions/purchases"
import { OrderCard } from "@/components/dashboard/OrderCard"
import { StudentPagination } from "@/components/dashboard/StudentPagination"
import { Button } from "@/components/ui/button"
import { env } from "@/lib/env"

export default async function ComprasPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams
  const { orders, error, total, page, pageSize } = await getUserOrders({ page: Number(params.page ?? 1) })
  const whatsappNumber = env.WHATSAPP_NUMBER()

  return (
    <section className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mis compras</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total === 0
            ? "Historial de compras realizadas"
            : total === 1
              ? "1 compra registrada"
              : `${total} compras registradas`}
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <p className="text-sm text-destructive">
            {error === "AUTH_REQUIRED" ? "Inicia sesión de nuevo para ver tus compras." : "No pudimos cargar tus compras. Inténtalo de nuevo."}
          </p>
          <Button asChild variant="outline"><Link href={error === "AUTH_REQUIRED" ? "/login?redirect=%2Fdashboard%2Fcompras" : "/dashboard/compras"}>{error === "AUTH_REQUIRED" ? "Iniciar sesión" : "Volver a intentar"}</Link></Button>
        </div>
      )}

      {/* Empty state */}
      {orders.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 py-16 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
            <ShoppingBag className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">{page > 1 ? "No hay compras en esta página" : "Aún no tienes compras"}</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">
            {page > 1 ? "Vuelve al inicio de tu historial para consultar tus compras." : "Explora el catálogo y encuentra tu próximo curso."}
          </p>
          <Button asChild className="mt-6">
            <Link href={page > 1 ? "/dashboard/compras" : "/cursos"}>{page > 1 ? "Ver mis compras" : "Explorar cursos"}</Link>
          </Button>
        </div>
      )}

      {/* Orders list */}
      {orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} whatsappNumber={whatsappNumber} />
          ))}
        </div>
      )}

      {!error && <StudentPagination pathname="/dashboard/compras" page={page} pageSize={pageSize} total={total} />}

      {/* Refund policy link */}
      {orders.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Consulta nuestra{" "}
          <Link
            href="/politica-de-reembolso"
            className="underline underline-offset-4 hover:text-foreground"
          >
            política de reembolso
          </Link>{" "}
          si tienes alguna inquietud con tu compra.
        </p>
      )}
    </section>
  )
}
