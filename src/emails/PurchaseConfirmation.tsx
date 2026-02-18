interface PurchaseConfirmationProps {
  customerName: string
  orderReference: string
  totalFormatted: string
  courseNames: string[]
}

export function PurchaseConfirmation({
  customerName,
  orderReference,
  totalFormatted,
  courseNames,
}: PurchaseConfirmationProps) {
  return (
    <div>
      <h1>¡Gracias por tu compra, {customerName}!</h1>
      <p>Tu orden <strong>{orderReference}</strong> ha sido confirmada.</p>
      <p>Total: {totalFormatted}</p>
      <h2>Cursos adquiridos:</h2>
      <ul>
        {courseNames.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p>Ya puedes acceder a tus cursos desde tu panel de estudiante.</p>
    </div>
  )
}
