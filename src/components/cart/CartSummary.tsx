"use client"

import { useFormStatus } from "react-dom"
import Link from "next/link"

import { formatCOP } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { PricingLine } from "@/types"

function CheckoutButton({ hasExternalPayment }: { hasExternalPayment: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      size="lg"
      className="mt-6 w-full"
      disabled={pending}
    >
      {pending
        ? "Procesando..."
        : hasExternalPayment
          ? "Proceder al pago"
          : "Finalizar inscripcion"}
    </Button>
  )
}

interface CartSummaryProps {
  checkoutAction: () => Promise<void>
  listSubtotal: number
  subtotal: number
  courseDiscountAmount: number
  comboDiscountAmount: number
  discountAmount: number
  discountName: string | null
  appliedDiscountLines: PricingLine[]
  total: number
  itemCount: number
}

export function CartSummary({
  checkoutAction,
  listSubtotal,
  subtotal,
  courseDiscountAmount,
  comboDiscountAmount,
  discountAmount,
  discountName,
  appliedDiscountLines,
  total,
  itemCount,
}: CartSummaryProps) {
  const hasExternalPayment = total > 0

  const groupedLines = appliedDiscountLines.reduce<
    Array<{ key: string; label: string; amount: number; kind: PricingLine["kind"] }>
  >((acc, line) => {
    const label =
      line.kind === "course_discount"
        ? `${line.course_title ?? line.source_name}`
        : line.source_name
    const key = `${line.kind}:${label}`
    const existing = acc.find((entry) => entry.key === key)
    if (existing) {
      existing.amount += line.amount
      return acc
    }
    acc.push({
      key,
      label,
      amount: line.amount,
      kind: line.kind,
    })
    return acc
  }, [])

  return (
    <div className="rounded-lg border p-6">
      <h2 className="text-lg font-semibold">Resumen del pedido</h2>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span>
            Subtotal lista ({itemCount})
          </span>
          <span>{formatCOP(listSubtotal)}</span>
        </div>

        {courseDiscountAmount > 0 && (
          <div className="flex justify-between text-emerald-600">
            <span>Descuentos por curso</span>
            <span>-{formatCOP(courseDiscountAmount)}</span>
          </div>
        )}

        {comboDiscountAmount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Combos{discountName ? ` (${discountName})` : ""}</span>
            <span>-{formatCOP(comboDiscountAmount)}</span>
          </div>
        )}

        {groupedLines.length > 0 && (
          <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="mb-2 font-medium text-foreground">Como se calculo</p>
            <div className="space-y-1.5">
              {groupedLines.map((line) => (
                <div key={line.key} className="flex justify-between gap-3">
                  <span>
                    {line.kind === "course_discount" ? "Promo curso" : "Combo"}:{" "}
                    {line.label}
                  </span>
                  <span>-{formatCOP(line.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal tras promo curso</span>
          <span>{formatCOP(subtotal)}</span>
        </div>

        <div className="flex justify-between border-t pt-2 text-base font-bold">
          <span>Total descuento</span>
          <span>-{formatCOP(discountAmount)}</span>
        </div>

        <div className="flex justify-between text-base font-bold">
          <span>Total a pagar</span>
          <span>{formatCOP(total)}</span>
        </div>
      </div>

      {/* Checkout button */}
      <form action={checkoutAction}>
        <CheckoutButton hasExternalPayment={hasExternalPayment} />
      </form>

      {/* Trust signals */}
      <div className="mt-4 space-y-2 text-xs text-muted-foreground">
        {hasExternalPayment ? (
          <>
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Pago seguro procesado por Wompi</span>
            </div>
            <p className="text-center">
              Acepta Nequi, PSE, Tarjeta y Daviplata
            </p>
          </>
        ) : (
          <p className="text-center">
            Acceso inmediato. Esta orden no requiere pago externo.
          </p>
        )}
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
