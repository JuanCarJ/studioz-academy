"use client"

import { useTransition } from "react"
import Link from "next/link"

import { createOrder } from "@/actions/checkout"
import { formatCOP } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface CartSummaryProps {
  subtotal: number
  discountAmount: number
  discountName: string | null
  total: number
  itemCount: number
}

export function CartSummary({
  subtotal,
  discountAmount,
  discountName,
  total,
  itemCount,
}: CartSummaryProps) {
  const [isPending, startTransition] = useTransition()

  function handleCheckout() {
    startTransition(async () => {
      await createOrder()
    })
  }

  return (
    <div className="rounded-lg border p-6">
      <h2 className="text-lg font-semibold">Resumen del pedido</h2>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span>
            Cursos ({itemCount})
          </span>
          <span>{formatCOP(subtotal)}</span>
        </div>

        {discountAmount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Descuento{discountName ? ` (${discountName})` : ""}</span>
            <span>-{formatCOP(discountAmount)}</span>
          </div>
        )}

        <div className="flex justify-between border-t pt-2 text-base font-bold">
          <span>Total</span>
          <span>{formatCOP(total)}</span>
        </div>
      </div>

      {/* Checkout button */}
      <form action={handleCheckout}>
        <Button
          type="submit"
          size="lg"
          className="mt-6 w-full"
          disabled={isPending}
        >
          {isPending ? "Procesando..." : "Proceder al pago"}
        </Button>
      </form>

      {/* Trust signals */}
      <div className="mt-4 space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>Pago seguro procesado por Wompi</span>
        </div>
        <p className="text-center">
          Acepta Nequi, PSE, Tarjeta y Daviplata
        </p>
      </div>

      {/* Legal links */}
      <div className="mt-3 flex justify-center gap-3 text-xs text-muted-foreground">
        <Link href="/politica-de-reembolso" className="hover:underline">
          Politica de reembolso
        </Link>
        <span>|</span>
        <Link href="/politica-de-privacidad" className="hover:underline">
          Privacidad
        </Link>
      </div>
    </div>
  )
}
