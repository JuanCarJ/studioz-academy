"use client"

interface CartSummaryProps {
  totalInCents: number
  itemCount: number
  onCheckout: () => void
}

export function CartSummary({ totalInCents, itemCount, onCheckout }: CartSummaryProps) {
  const formatted = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(totalInCents / 100)

  return (
    <div className="rounded-lg border p-6">
      <h2 className="text-lg font-semibold">Resumen</h2>
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Cursos ({itemCount})</span>
          <span>{formatted}</span>
        </div>
      </div>
      <button
        onClick={onCheckout}
        className="mt-6 w-full rounded-lg bg-primary py-3 text-center font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Pagar con Wompi
      </button>
    </div>
  )
}
