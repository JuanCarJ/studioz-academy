"use client"

import { useState, useTransition } from "react"
import { ChevronDown, ChevronUp, MessageCircle, RefreshCw } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { getOrderStatusWithFallback } from "@/actions/payments"
import { formatCOP } from "@/lib/utils"
import type { OrderSummary } from "@/actions/purchases"

interface OrderCardProps {
  order: OrderSummary
  whatsappNumber?: string
}

type OrderStatus = OrderSummary["status"]

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  declined: "Rechazado",
  voided: "Anulado",
  refunded: "Reembolsado",
  chargeback: "Contracargo",
}

const STATUS_VARIANT: Record<
  OrderStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  approved: "default",
  declined: "destructive",
  voided: "outline",
  refunded: "default",
  chargeback: "destructive",
}

// Extra class overrides for colors not covered by shadcn variants
const STATUS_CLASS: Record<OrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  declined: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
  voided: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-950/40 dark:text-gray-400 dark:border-gray-800",
  refunded: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  chargeback: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatPaymentMethod(method: string | null): string {
  if (!method) return "No disponible"
  const labels: Record<string, string> = {
    CARD: "Tarjeta",
    NEQUI: "Nequi",
    PSE: "PSE",
    BANCOLOMBIA_TRANSFER: "Bancolombia",
    BANCOLOMBIA_COLLECT: "Bancolombia Collect",
    EFECTY: "Efecty",
  }
  return labels[method.toUpperCase()] ?? method
}

export function OrderCard({ order, whatsappNumber }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [currentStatus, setCurrentStatus] = useState<OrderStatus>(order.status)
  const [isPending, startTransition] = useTransition()
  const [recheckMsg, setRecheckMsg] = useState<string | null>(null)

  const whatsappMessage = encodeURIComponent(
    `Hola, necesito soporte con mi orden Studio Z. Referencia: ${order.reference}`
  )
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`
    : null

  function handleRecheck() {
    setRecheckMsg(null)
    startTransition(async () => {
      const result = await getOrderStatusWithFallback(order.reference)
      if (result.order) {
        const newStatus = result.order.status as OrderStatus
        if (newStatus !== currentStatus) {
          setCurrentStatus(newStatus)
          setRecheckMsg("Estado actualizado.")
        } else {
          setRecheckMsg("El estado no ha cambiado aun.")
        }
      } else {
        setRecheckMsg("No se pudo consultar el estado. Intenta de nuevo.")
      }
    })
  }

  const hasPendingStatus = currentStatus === "pending"

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-sm">
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-muted-foreground">
                {order.reference}
              </span>
              <Badge
                variant={STATUS_VARIANT[currentStatus]}
                className={STATUS_CLASS[currentStatus]}
              >
                {STATUS_LABELS[currentStatus]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDate(order.created_at)}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            <span className="text-sm font-bold">{formatCOP(order.total)}</span>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <CardContent className="border-t px-4 pb-4 pt-4 space-y-4">
          {/* Items list */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cursos
            </p>
            {order.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin detalles disponibles.</p>
            ) : (
              <ul className="space-y-2">
                {order.items.map((item, idx) => (
                  <li key={idx} className="flex items-start justify-between gap-2 text-sm">
                    <span className="flex-1 leading-snug">{item.course_title_snapshot}</span>
                    <span className="flex-shrink-0 font-medium">
                      {formatCOP(item.price_at_purchase)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Separator />

          {/* Subtotals */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCOP(order.subtotal)}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-500">
                <span>Descuento</span>
                <span>-{formatCOP(order.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatCOP(order.total)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Metodo de pago</span>
            <span>{formatPaymentMethod(order.payment_method)}</span>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {hasPendingStatus && (
              <div className="flex flex-col gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRecheck}
                  disabled={isPending}
                  className="gap-2"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                  {isPending ? "Consultando..." : "Reconsultar estado"}
                </Button>
                {recheckMsg && (
                  <p className="text-xs text-muted-foreground">{recheckMsg}</p>
                )}
              </div>
            )}
            {whatsappUrl && (
              <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Solicitar soporte
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
