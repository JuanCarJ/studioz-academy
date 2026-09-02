import { redirect } from "next/navigation"
import { BoldCheckoutView } from "@/components/payment/BoldCheckoutView"
import { buildBoldCheckoutConfig, isPaymentReference, isBoldCheckoutExpired } from "@/lib/bold"
import { getCurrentUser } from "@/lib/supabase/auth"
import { getPayableCheckoutOrder } from "@/lib/checkout-order"
import Link from "next/link"

export const metadata = { title: "Pago seguro — Studio Z Academy" }
export default async function PaymentCheckoutPage({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  const { reference } = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/pago/checkout?reference=${reference ?? ""}`)}`)
  if (!isPaymentReference(reference)) redirect("/carrito?error=order_failed")
  const { order, eligible, reason } = await getPayableCheckoutOrder(reference, user.id)
  if (!order) redirect("/dashboard/compras")
  if (order.status !== "pending") redirect(`/pago/retorno?reference=${encodeURIComponent(reference)}`)
  if (reason === "expired" || isBoldCheckoutExpired(order.created_at)) {
    return <section className="container mx-auto px-4 py-16 text-center"><h1 className="text-2xl font-bold">Revisemos tu pago antes de reintentarlo</h1><p className="mt-2">Esta orden necesita revisión. No repitas el pago hasta confirmar su estado con soporte.</p><Link className="mt-6 inline-block underline" href="/dashboard/compras">Consultar mis compras</Link></section>
  }
  if (!eligible) return <section className="container mx-auto px-4 py-16 text-center"><h1 className="text-2xl font-bold">Esta orden necesita revisión</h1><p className="mt-2">La disponibilidad de los cursos o de tu acceso cambió. Contacta a soporte antes de reintentar el pago.</p><Link className="mt-6 inline-block underline" href="/dashboard/compras">Consultar mis compras</Link></section>
  let config
  try { config = buildBoldCheckoutConfig(reference, order.total) }
  catch { return <section className="container mx-auto px-4 py-16 text-center"><h1 className="text-2xl font-bold">Pago no disponible en este momento</h1><p className="mt-2">Tu orden sigue guardada. Puedes volver a intentarlo más tarde.</p><Link className="mt-6 inline-block underline" href="/dashboard/compras">Ir a mis compras</Link></section> }
  return <section className="container mx-auto px-4 py-16"><BoldCheckoutView config={config} /></section>
}
