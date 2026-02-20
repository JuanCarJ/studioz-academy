"use client"

import Link from "next/link"
import { ShoppingCart } from "lucide-react"

import { Button } from "@/components/ui/button"

export function CartIcon({ itemCount = 0 }: { itemCount?: number }) {
  return (
    <Button variant="ghost" size="icon" className="relative" asChild>
      <Link href="/carrito" aria-label="Carrito de compras">
        <ShoppingCart className="h-5 w-5" />
        {itemCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
            {itemCount}
          </span>
        )}
      </Link>
    </Button>
  )
}
