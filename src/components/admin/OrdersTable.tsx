"use client"

import { useState } from "react"

import { formatCOP } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { OrderDetailModal } from "@/components/admin/OrderDetailModal"

import type { OrderListItem } from "@/actions/admin/orders"

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

interface OrdersTableProps {
  orders: OrderListItem[]
}

export function OrdersTable({ orders }: OrdersTableProps) {
  const [selectedOrder, setSelectedOrder] = useState<OrderListItem | null>(null)

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("es-CO", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Referencia</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Metodo pago</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-8 text-center text-muted-foreground"
              >
                No se encontraron ordenes con los filtros aplicados.
              </TableCell>
            </TableRow>
          )}
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-mono text-sm">
                {order.reference}
              </TableCell>
              <TableCell>
                <div>
                  <p className="font-medium">{order.customer_name_snapshot}</p>
                  <p className="text-xs text-muted-foreground">
                    {order.customer_email_snapshot}
                  </p>
                </div>
              </TableCell>
              <TableCell className="font-medium">
                {formatCOP(order.total)}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANTS[order.status] ?? "secondary"}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">
                {order.payment_method ?? "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(order.created_at)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedOrder(order)}
                >
                  Ver
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          open={!!selectedOrder}
          onOpenChange={(open) => {
            if (!open) setSelectedOrder(null)
          }}
        />
      )}
    </>
  )
}
