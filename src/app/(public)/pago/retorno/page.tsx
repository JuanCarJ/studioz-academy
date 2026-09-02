import { getOrderStatusWithFallback } from "@/actions/payments"
import { PaymentReturnView } from "@/components/payment/PaymentReturnView"

export const metadata = { title: "Estado de tu pago — Studio Z Academy" }
export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  const { reference } = await searchParams
  if (!reference) return <section className="container mx-auto px-4 py-16 text-center"><h1 className="text-2xl font-bold">Enlace de pago incompleto</h1><p className="mt-2 text-muted-foreground">Abre esta compra desde “Mis compras” para consultar su estado.</p></section>
  const result = await getOrderStatusWithFallback(reference)
  return <section className="container mx-auto px-4 py-16"><PaymentReturnView key={reference} reference={reference} initialOrder={result.order} orderItems={result.orderItems} isFirstPurchase={result.isFirstPurchase} /></section>
}
