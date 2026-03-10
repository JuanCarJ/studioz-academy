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
    PROMO: "Promocion interna",
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
  const groupedDiscountLines = order.discount_lines.reduce<
    Array<{ key: string; label: string; amount: number }>
  >((acc, line) => {
    const label =
      line.kind === "course_discount"
        ? `Promo curso: ${line.course_title_snapshot ?? line.source_name_snapshot}`
        : `Combo: ${line.source_name_snapshot}`
    const key = `${line.kind}:${label}`
    const existing = acc.find((entry) => entry.key === key)
    if (existing) {
      existing.amount += line.amount
      return acc
    }
    acc.push({ key, label, amount: line.amount })
    return acc
  }, [])

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
            <p className="text-sm font-semibold leading-snug line-clamp-1">
              {order.items.length === 0
                ? order.reference
                : order.items.length === 1
                  ? order.items[0].course_title_snapshot
                  : `${order.items[0].course_title_snapshot} y ${order.items.length - 1} más`}
            </p>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
              <span>{formatDate(order.created_at)}</span>
              {order.payment_method && (
                <>
                  <span>·</span>
                  <span>{formatPaymentMethod(order.payment_method)}</span>
                </>
              )}
              <span>·</span>
              <span className="font-mono text-[10px]">{order.reference}</span>
              <Badge
                variant={STATUS_VARIANT[currentStatus]}
                className={`${STATUS_CLASS[currentStatus]} text-[10px] px-1.5 py-0`}
              >
                {STATUS_LABELS[currentStatus]}
              </Badge>
            </div>
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
                    <div className="flex-1 leading-snug">
                      <div>{item.course_title_snapshot}</div>
                      {(item.course_discount_amount_snapshot > 0 ||
                        item.combo_discount_amount_snapshot > 0) && (
                        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          <div>Lista: {formatCOP(item.list_price_snapshot)}</div>
                          {item.course_discount_amount_snapshot > 0 && (
                            <div>
                              Promo curso: -{formatCOP(item.course_discount_amount_snapshot)}
                            </div>
                          )}
                          {item.combo_discount_amount_snapshot > 0 && (
                            <div>
                              Combo: -{formatCOP(item.combo_discount_amount_snapshot)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="flex-shrink-0 font-medium">
                      {formatCOP(item.final_price_snapshot)}
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
              <span>Subtotal lista</span>
              <span>{formatCOP(order.list_subtotal)}</span>
            </div>
            {order.course_discount_amount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-500">
                <span>Descuentos por curso</span>
                <span>-{formatCOP(order.course_discount_amount)}</span>
              </div>
            )}
            {order.combo_discount_amount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-500">
                <span>
                  Combos
                  {order.discount_rule_name ? ` (${order.discount_rule_name})` : ""}
                </span>
                <span>-{formatCOP(order.combo_discount_amount)}</span>
              </div>
            )}
            {groupedDiscountLines.length > 0 && (
              <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="mb-2 font-medium text-foreground">Detalle de descuentos</p>
                <div className="space-y-1">
                  {groupedDiscountLines.map((line) => (
                    <div key={line.key} className="flex justify-between gap-3">
                      <span>{line.label}</span>
                      <span>-{formatCOP(line.amount)}</span>
                    </div>
                  ))}
                </div>
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
