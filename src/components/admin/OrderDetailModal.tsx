"use client"

import { useEffect, useState, useTransition } from "react"

import { getOrderDetail, resendPurchaseEmail } from "@/actions/admin/orders"
import { formatCOP } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import type { OrderListItem, OrderDetailResult } from "@/actions/admin/orders"

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  declined: "Rechazada",
  voided: "Anulada",
  refunded: "Reembolsada",
  chargeback: "Contracargo",
}

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  approved: "default",
  declined: "destructive",
  voided: "outline",
  refunded: "outline",
  chargeback: "destructive",
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatPaymentMethod(method: string | null): string {
  if (!method) return "—"

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

function getPayerEmailFromEvents(events: OrderDetailResult["order"]["payment_events"]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const payload = events[index]?.payload_json as
      | {
          data?: { transaction?: { customer_email?: string } }
        }
      | undefined

    const payerEmail = payload?.data?.transaction?.customer_email
    if (payerEmail) return payerEmail
  }

  return null
}

interface OrderDetailModalProps {
  order: OrderListItem
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OrderDetailModal({
  order,
  open,
  onOpenChange,
}: OrderDetailModalProps) {
  const [detail, setDetail] = useState<OrderDetailResult | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [emailMessage, setEmailMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPendingEmail, startEmail] = useTransition()

  useEffect(() => {
    if (!open) {
      setEmailMessage(null)
      setLoadError(null)
      return
    }

    if (detail?.order.id === order.id) {
      return
    }

    let cancelled = false

    setIsLoading(true)
    setLoadError(null)
    setDetail(null)

    ;(async () => {
      try {
        const result = await getOrderDetail(order.id)
        if (cancelled) return

        if (!result) {
          setLoadError("No se pudo cargar el detalle de la orden.")
          return
        }

        setDetail(result)
      } catch (error) {
        console.error("[OrderDetailModal] load failed", error)
        if (!cancelled) {
          setLoadError("No se pudo cargar el detalle de la orden.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [detail?.order.id, open, order.id])

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setEmailMessage(null)
    }
    onOpenChange(nextOpen)
  }

  function handleResendEmail() {
    setEmailMessage(null)
    startEmail(async () => {
      try {
        const result = await resendPurchaseEmail(order.id)
        if (result.success) {
          setEmailMessage("El email fue encolado para reenvio.")
        } else {
          setEmailMessage("Error al reenviar el email.")
        }
      } catch (error) {
        console.error("[OrderDetailModal] resend failed", error)
        setEmailMessage("Error al reenviar el email.")
      }
    })
  }

  const d = detail?.order
  const payerEmail = d ? getPayerEmailFromEvents(d.payment_events) : null
  const groupedDiscountLines = d?.discount_lines.reduce<
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            Orden {order.reference}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-8 w-full animate-pulse rounded-md bg-muted"
              />
            ))}
          </div>
        )}

        {loadError && (
          <p className="py-4 text-sm text-destructive">{loadError}</p>
        )}

        {d && !isLoading && (
          <div className="space-y-5">
            {/* Header row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Fecha: {formatDate(d.created_at)}
                </p>
                {d.approved_at && (
                  <p className="text-xs text-muted-foreground">
                    Aprobada: {formatDate(d.approved_at)}
                  </p>
                )}
              </div>
              <Badge variant={STATUS_VARIANTS[d.status] ?? "secondary"}>
                {STATUS_LABELS[d.status] ?? d.status}
              </Badge>
            </div>

            <Separator />

            {/* Customer info */}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Datos del cliente</h3>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Nombre:</span>{" "}
                  {d.customer_name_snapshot}
                </p>
                <p>
                  <span className="text-muted-foreground">Email cuenta:</span>{" "}
                  {d.customer_email_snapshot}
                </p>
                {payerEmail && (
                  <p>
                    <span className="text-muted-foreground">
                      Email pagador Wompi:
                    </span>{" "}
                    {payerEmail}
                  </p>
                )}
                <p>
                  <span className="text-muted-foreground">Telefono:</span>{" "}
                  {d.customer_phone_snapshot ?? "—"}
                </p>
              </div>
            </div>

            <Separator />

            {/* Items */}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Cursos comprados</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Curso</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.items.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={2}
                        className="text-center text-muted-foreground"
                      >
                        Sin items.
                      </TableCell>
                    </TableRow>
                  ) : (
                    d.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p>{item.course_title_snapshot}</p>
                            {(item.course_discount_amount_snapshot > 0 ||
                              item.combo_discount_amount_snapshot > 0) && (
                              <div className="text-xs text-muted-foreground">
                                <p>Lista: {formatCOP(item.list_price_snapshot)}</p>
                                {item.course_discount_amount_snapshot > 0 && (
                                  <p>
                                    Promo curso: -
                                    {formatCOP(item.course_discount_amount_snapshot)}
                                  </p>
                                )}
                                {item.combo_discount_amount_snapshot > 0 && (
                                  <p>
                                    Combo: -{formatCOP(item.combo_discount_amount_snapshot)}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCOP(item.final_price_snapshot)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal lista</span>
                <span>{formatCOP(d.list_subtotal)}</span>
              </div>
              {d.course_discount_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Descuentos por curso
                  </span>
                  <span className="text-green-600">
                    -{formatCOP(d.course_discount_amount)}
                  </span>
                </div>
              )}
              {d.combo_discount_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Combos
                    {d.discount_rule_name
                      ? ` (${d.discount_rule_name})`
                      : ""}
                  </span>
                  <span className="text-green-600">
                    -{formatCOP(d.combo_discount_amount)}
                  </span>
                </div>
              )}
              {groupedDiscountLines && groupedDiscountLines.length > 0 && (
                <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                  <p className="mb-2 font-medium text-foreground">
                    Detalle de descuentos
                  </p>
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
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatCOP(d.total)}</span>
              </div>
            </div>

            <Separator />

            {/* Payment info */}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Informacion de pago</h3>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Metodo:</span>{" "}
                  {formatPaymentMethod(d.payment_method)}
                </p>
                {d.payment_detail && (
                  <p>
                    <span className="text-muted-foreground">Detalle:</span>{" "}
                    {d.payment_detail}
                  </p>
                )}
                {d.wompi_transaction_id && (
                  <p>
                    <span className="text-muted-foreground">
                      ID transaccion Wompi:
                    </span>{" "}
                    <span className="font-mono text-xs">
                      {d.wompi_transaction_id}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* Payment events timeline */}
            {d.payment_events.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="mb-2 text-sm font-semibold">
                    Historial de eventos de pago
                  </h3>
                  <ol className="space-y-2">
                    {d.payment_events.map((event) => (
                      <li
                        key={event.id}
                        className="flex items-start gap-3 text-sm"
                      >
                        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {event.source} — {event.mapped_status}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Estado externo: {event.external_status}
                            {event.reason ? ` — ${event.reason}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(event.processed_at)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            )}

            <Separator />

            {/* Actions */}
            <div className="flex items-center justify-between">
              {emailMessage && (
                <p className="text-sm text-muted-foreground">{emailMessage}</p>
              )}
              {!emailMessage && <span />}
              <Button
                variant="outline"
                size="sm"
                disabled={isPendingEmail}
                onClick={handleResendEmail}
              >
                {isPendingEmail ? "Reenviando..." : "Reenviar email de compra"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
