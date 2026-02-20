"use client"

import { useState, useTransition } from "react"

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
  const [isPendingLoad, startLoad] = useTransition()
  const [isPendingEmail, startEmail] = useTransition()

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !detail) {
      setLoadError(null)
      startLoad(async () => {
        const result = await getOrderDetail(order.id)
        if (!result) {
          setLoadError("No se pudo cargar el detalle de la orden.")
        } else {
          setDetail(result)
        }
      })
    }
    if (!nextOpen) {
      setEmailMessage(null)
    }
    onOpenChange(nextOpen)
  }

  function handleResendEmail() {
    setEmailMessage(null)
    startEmail(async () => {
      const result = await resendPurchaseEmail(order.id)
      if (result.success) {
        setEmailMessage("El email fue encolado para reenvio.")
      } else {
        setEmailMessage("Error al reenviar el email.")
      }
    })
  }

  const d = detail?.order

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            Orden {order.reference}
          </DialogTitle>
        </DialogHeader>

        {isPendingLoad && (
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

        {d && !isPendingLoad && (
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
                  <span className="text-muted-foreground">Email:</span>{" "}
                  {d.customer_email_snapshot}
                </p>
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
                        <TableCell>{item.course_title_snapshot}</TableCell>
                        <TableCell className="text-right">
                          {formatCOP(item.price_at_purchase)}
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
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCOP(d.subtotal)}</span>
              </div>
              {d.discount_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Descuento</span>
                  <span className="text-green-600">
                    -{formatCOP(d.discount_amount)}
                  </span>
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
                  {d.payment_method ?? "—"}
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
