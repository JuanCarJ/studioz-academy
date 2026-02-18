interface CartItemProps {
  courseTitle: string
  priceInCents: number
  onRemove: () => void
}

export function CartItem({ courseTitle, priceInCents, onRemove }: CartItemProps) {
  const formatted = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(priceInCents / 100)

  return (
    <div className="flex items-center justify-between border-b py-4">
      <div>
        <p className="font-medium">{courseTitle}</p>
        <p className="text-sm text-muted-foreground">{formatted}</p>
      </div>
      <button onClick={onRemove} className="text-sm text-red-500 hover:underline">
        Eliminar
      </button>
    </div>
  )
}
