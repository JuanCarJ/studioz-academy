"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { getOrderStatusWithFallback } from "@/actions/payments"
import type { OrderItem } from "@/actions/payments"
import { Button } from "@/components/ui/button"

import type { Order } from "@/types"

interface PaymentReturnViewProps {
  reference: string
  initialOrder: Order | null
  orderItems?: OrderItem[]
  isFirstPurchase?: boolean
}

const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER

export function PaymentReturnView({
  reference,
  initialOrder,
  orderItems: initialOrderItems,
  isFirstPurchase: initialIsFirst,
}: PaymentReturnViewProps) {
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(initialOrder)
  const [orderItems, setOrderItems] = useState<OrderItem[]>(
    initialOrderItems ?? []
  )
  const [isFirstPurchase, setIsFirstPurchase] = useState(
    initialIsFirst ?? false
  )
  const [isPending, startTransition] = useTransition()

  // Auto-refresh every 5s while pending
  useEffect(() => {
    if (order?.status !== "pending") return

    const interval = setInterval(() => {
      router.refresh()
    }, 5000)

    return () => clearInterval(interval)
  }, [order?.status, router])

  function handleRefresh() {
    startTransition(async () => {
      const result = await getOrderStatusWithFallback(reference)
      if (result.order) {
        setOrder(result.order)
        if (result.orderItems) setOrderItems(result.orderItems)
        if (result.isFirstPurchase !== undefined)
          setIsFirstPurchase(result.isFirstPurchase)
      }
    })
  }

  if (!order) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold">Orden no encontrada</h2>
        <p className="mt-2 text-muted-foreground">
          No encontramos una orden con la referencia {reference}.
        </p>
        <Button className="mt-6" asChild>
          <Link href="/cursos">Explorar cursos</Link>
        </Button>
      </div>
    )
  }

  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        `Hola, tuve un problema con mi pago. Referencia: ${reference}`
      )}`
    : null

  // H-09: Determine primary CTA for approved state
  const firstCourseSlug = orderItems[0]?.courseSlug
  const primaryCtaHref = isFirstPurchase && firstCourseSlug
    ? `/dashboard/cursos/${firstCourseSlug}`
    : "/dashboard"
  const primaryCtaLabel = isFirstPurchase
    ? "Comenzar tu primera leccion"
    : "Ir a mis cursos"

  return (
    <div className="mx-auto max-w-lg text-center">
      {/* Reference always visible */}
      <p className="mb-6 text-sm text-muted-foreground">
        Referencia: <span className="font-mono font-medium">{reference}</span>
      </p>

      {order.status === "approved" && (
        <>
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold">Compra exitosa!</h2>
          <p className="mt-2 text-muted-foreground">
            Ya tienes acceso a tus cursos. Comienza a aprender ahora.
          </p>

          {/* H-09: Course list */}
          {orderItems.length > 0 && (
            <ul className="mx-auto mt-4 max-w-sm space-y-2 text-left">
              {orderItems.map((item) => (
                <li key={item.courseSlug}>
                  <Link
                    href={`/dashboard/cursos/${item.courseSlug}`}
                    className="block rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    {item.courseTitle}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex flex-col gap-3">
            <Button size="lg" asChild>
              <Link href={primaryCtaHref}>{primaryCtaLabel}</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/cursos">Seguir explorando cursos</Link>
            </Button>
          </div>
        </>
      )}

      {order.status === "pending" && (
        <>
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <svg className="h-8 w-8 animate-spin text-amber-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold">Procesando pago...</h2>
          <p className="mt-2 text-muted-foreground">
            Estamos verificando tu transaccion. Esto puede tomar unos momentos.
          </p>
          <Button
            className="mt-6"
            variant="outline"
            onClick={handleRefresh}
            disabled={isPending}
          >
            {isPending ? "Consultando..." : "Reconsultar estado"}
          </Button>
          {whatsappUrl && (
            <p className="mt-4 text-sm text-muted-foreground">
              Necesitas ayuda?{" "}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Escribenos por WhatsApp
              </a>
            </p>
          )}
        </>
      )}

      {order.status === "declined" && (
        <>
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold">Pago no aprobado</h2>
          <p className="mt-2 text-muted-foreground">
            Tu transaccion no fue aprobada. Puedes intentarlo de nuevo desde tu carrito.
          </p>
          <Button className="mt-6" asChild>
            <Link href="/carrito">Volver al carrito</Link>
          </Button>
          {whatsappUrl && (
            <p className="mt-4 text-sm text-muted-foreground">
              Necesitas ayuda?{" "}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Escribenos por WhatsApp
              </a>
            </p>
          )}
        </>
      )}

      {(order.status === "voided" ||
        order.status === "refunded" ||
        order.status === "chargeback") && (
        <>
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <svg className="h-8 w-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold">
            {order.status === "voided" && "Transaccion anulada"}
            {order.status === "refunded" && "Pago reembolsado"}
            {order.status === "chargeback" && "Contracargo registrado"}
          </h2>
          <p className="mt-2 text-muted-foreground">
            Tu transaccion ha sido procesada como {order.status}. Si tienes dudas,
            contactanos.
          </p>
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block text-primary hover:underline"
            >
              Contactar soporte por WhatsApp
            </a>
          )}
        </>
      )}
    </div>
  )
}
