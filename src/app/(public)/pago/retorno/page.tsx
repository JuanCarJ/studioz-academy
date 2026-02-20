import { getOrderStatusWithFallback } from "@/actions/payments"
import { PaymentReturnView } from "@/components/payment/PaymentReturnView"

export const metadata = { title: "Estado de tu pago — Studio Z Academy" }

interface PageProps {
  searchParams: Promise<{ reference?: string }>
}

export default async function PaymentReturnPage({ searchParams }: PageProps) {
  const { reference } = await searchParams

  if (!reference) {
    return (
      <section className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Referencia no proporcionada</h1>
        <p className="mt-2 text-muted-foreground">
          No se encontro una referencia de pago en la URL.
        </p>
      </section>
    )
  }

  const { order, orderItems, isFirstPurchase } =
    await getOrderStatusWithFallback(reference)

  return (
    <section className="container mx-auto px-4 py-16">
      <PaymentReturnView
        reference={reference}
        initialOrder={order}
        orderItems={orderItems}
        isFirstPurchase={isFirstPurchase}
      />
    </section>
  )
}
