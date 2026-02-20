"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { addToCart } from "@/actions/cart"
import { enrollFree } from "@/actions/enrollments"
import { Button } from "@/components/ui/button"
import { formatCOP } from "@/lib/utils"

interface CourseActionsProps {
  courseId: string
  slug: string
  isFree: boolean
  isEnrolled: boolean
  isInCart: boolean
  price: number
  isAuthenticated: boolean
}

export function CourseActions({
  courseId,
  slug,
  isFree,
  isEnrolled,
  isInCart,
  price,
  isAuthenticated,
}: CourseActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function requireAuth(options?: { includeAddToCart?: boolean }) {
    const params = new URLSearchParams({ redirect: `/cursos/${slug}` })

    if (options?.includeAddToCart) {
      params.set("addToCart", courseId)
    }

    router.push(`/login?${params.toString()}`)
  }

  function handleAddToCart() {
    if (!isAuthenticated) return requireAuth({ includeAddToCart: true })

    setError(null)
    startTransition(async () => {
      const result = await addToCart(courseId)
      if (result && "error" in result) {
        if (result.error === "AUTH_REQUIRED") {
          return requireAuth({ includeAddToCart: true })
        }
        setError(result.error as string)
      } else {
        router.refresh()
      }
    })
  }

  function handleEnrollFree() {
    if (!isAuthenticated) return requireAuth()

    setError(null)
    startTransition(async () => {
      const result = await enrollFree(courseId)
      if (result && "error" in result) {
        if (result.error === "AUTH_REQUIRED") return requireAuth()
        setError(result.error as string)
      } else {
        router.push(`/dashboard/cursos/${slug}`)
      }
    })
  }

  if (isEnrolled) {
    return (
      <Button size="lg" className="w-full" asChild>
        <Link href={`/dashboard/cursos/${slug}`}>Ir al curso</Link>
      </Button>
    )
  }

  if (isInCart) {
    return (
      <Button size="lg" variant="secondary" className="w-full" asChild>
        <Link href="/carrito">Ya en tu carrito</Link>
      </Button>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {isFree ? (
        <Button
          size="lg"
          className="w-full"
          onClick={handleEnrollFree}
          disabled={isPending}
        >
          {isPending ? "Inscribiendo..." : "Inscribirme gratis"}
        </Button>
      ) : (
        <>
          <div className="text-2xl font-bold">{formatCOP(price)}</div>
          <Button
            size="lg"
            className="w-full"
            onClick={handleAddToCart}
            disabled={isPending}
          >
            {isPending ? "Agregando..." : "Agregar al carrito"}
          </Button>
        </>
      )}
    </div>
  )
}
