import Link from "next/link"
import { ShoppingBag } from "lucide-react"

import { getUserOrders } from "@/actions/purchases"
import { OrderCard } from "@/components/dashboard/OrderCard"
import { Button } from "@/components/ui/button"

export default async function ComprasPage() {
  const { orders, error } = await getUserOrders()

  return (
    <section className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mis compras</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {orders.length === 0
            ? "Historial de compras realizadas"
            : orders.length === 1
              ? "1 orden registrada"
              : `${orders.length} ordenes registradas`}
        </p>
      </div>

      {/* Error state */}
      {error && error !== "AUTH_REQUIRED" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">
            Hubo un error al cargar tus compras. Por favor recarga la pagina.
          </p>
        </div>
      )}

      {/* Empty state */}
      {orders.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 py-16 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
            <ShoppingBag className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">Aun no tienes compras</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">
            Explora el catalogo y encuentra el curso perfecto para ti.
          </p>
          <Button asChild className="mt-6">
            <Link href="/cursos">Explorar cursos</Link>
          </Button>
        </div>
      )}

      {/* Orders list */}
      {orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}

      {/* Refund policy link */}
      {orders.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Consulta nuestra{" "}
          <Link
            href="/politica-de-reembolso"
            className="underline underline-offset-4 hover:text-foreground"
          >
            politica de reembolso
          </Link>{" "}
          si tienes alguna inquietud con tu compra.
        </p>
      )}
    </section>
  )
}
