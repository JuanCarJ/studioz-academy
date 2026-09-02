"use client"
import { useState, useTransition } from "react"
import {
  reconcileOrderAdmin,
  recordConfirmedReversal,
} from "@/actions/admin/payment-operations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
export function PaymentOperations({
  orderId,
  status,
  onUpdated,
}: {
  orderId: string
  status: string
  onUpdated: () => void
}) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState("")
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">Resolver esta compra</h3>
      {status === "pending" && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                const r = await reconcileOrderAdmin(orderId)
                setMessage(
                  r.error ??
                    (r.applied
                      ? "Pago actualizado."
                      : "Todavía no hay una confirmación nueva.")
                )
                onUpdated()
              } catch {
                setMessage("No pudimos consultar el pago. Inténtalo más tarde.")
              }
            })
          }
        >
          {pending ? "Consultando…" : "Consultar pago ahora"}
        </Button>
      )}
      {status === "approved" && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3">
            Registrar devolución o contracargo confirmado
          </summary>
          <p className="mb-3 text-sm text-muted-foreground">
            Esta acción no devuelve dinero. Úsala solo después de confirmar el
            movimiento en Bold o en el proveedor histórico. Retira el acceso a
            los cursos de esta compra.
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              const data = new FormData(e.currentTarget)
              start(async () => {
                try {
                  const r = await recordConfirmedReversal({
                    orderId,
                    status:
                      data.get("status") === "chargeback"
                        ? "chargeback"
                        : "refunded",
                    evidence: String(data.get("evidence")),
                    confirmed: true,
                  })
                  setMessage(r.error ?? "Movimiento registrado.")
                  onUpdated()
                } catch {
                  setMessage(
                    "No pudimos registrar el movimiento. Revisa el estado antes de intentarlo otra vez."
                  )
                }
              })
            }}
          >
            <label className="block">
              Movimiento
              <select
                className="mt-1 h-11 w-full rounded border bg-background px-3"
                name="status"
              >
                <option value="refunded">Reembolso confirmado</option>
                <option value="chargeback">Contracargo confirmado</option>
              </select>
            </label>
            <label className="block">
              Comprobante y motivo
              <Input name="evidence" minLength={8} maxLength={500} required />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" required />
              Verifiqué el movimiento con el proveedor y confirmo retirar el
              acceso.
            </label>
            <Button variant="destructive" disabled={pending}>
              Registrar movimiento
            </Button>
          </form>
        </details>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  )
}
