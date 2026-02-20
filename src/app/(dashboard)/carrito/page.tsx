import { redirect } from "next/navigation"
import Link from "next/link"

import { getCurrentUser } from "@/lib/supabase/auth"
import { getCart } from "@/actions/cart"
import { CartItem } from "@/components/cart/CartItem"
import { CartSummary } from "@/components/cart/CartSummary"
import { Button } from "@/components/ui/button"

export const metadata = { title: "Carrito — Studio Z Academy" }

export default async function CartPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login?redirect=/carrito")

  const items = await getCart()

  if (items.length === 0) {
    return (
      <section className="container mx-auto px-4 py-16 text-center">
        <svg className="mx-auto mb-4 h-16 w-16 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
        </svg>
        <h1 className="text-2xl font-bold">Tu carrito esta vacio</h1>
        <p className="mt-2 text-muted-foreground">
          Explora nuestro catalogo y agrega los cursos que te interesen.
        </p>
        <Button className="mt-6" asChild>
          <Link href="/cursos">Explorar cursos</Link>
        </Button>
      </section>
    )
  }

  const subtotal = items.reduce((acc, item) => acc + item.course.price, 0)
  // Discount logic placeholder — ready for Inc 4 combo rules
  const discountAmount = 0
  const discountName: string | null = null
  const total = subtotal - discountAmount

  return (
    <section className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Carrito de compras</h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Items */}
        <div className="lg:col-span-2">
          {items.map((item) => (
            <CartItem key={item.id} item={item} />
          ))}
        </div>

        {/* Summary sidebar */}
        <div className="space-y-4">
          <CartSummary
            subtotal={subtotal}
            discountAmount={discountAmount}
            discountName={discountName}
            total={total}
            itemCount={items.length}
          />
          <p className="text-center text-xs text-muted-foreground">
            Al realizar tu compra aceptas nuestra{" "}
            <Link
              href="/politica-de-reembolso"
              className="underline underline-offset-4 hover:text-foreground"
            >
              politica de reembolso
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  )
}
