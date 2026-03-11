"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Check, Loader2, ShoppingCart } from "lucide-react"

import { addToCart } from "@/actions/cart"
import { enrollFree } from "@/actions/enrollments"
import { buildCourseAuthPath } from "@/lib/auth-intent"
import { dispatchCartCountUpdated } from "@/lib/cart-events"
import { getCartErrorMessage } from "@/lib/cart"
import { Button } from "@/components/ui/button"

interface CourseCardActionProps {
  courseId: string
  courseTitle: string
  slug: string
  isFree: boolean
  isInCart: boolean
  isEnrolled: boolean
  isAuthenticated: boolean
}

export function CourseCardAction({
  courseId,
  courseTitle,
  slug,
  isFree,
  isInCart,
  isEnrolled,
  isAuthenticated,
}: CourseCardActionProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [localIsInCart, setLocalIsInCart] = useState(isInCart)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLocalIsInCart(isInCart)
  }, [isInCart])

  function requireAuth(intentKind: "add_to_cart" | "enroll_free") {
    router.push(
      buildCourseAuthPath({
        slug,
        intent: {
          kind: intentKind,
          courseId,
        },
      })
    )
  }

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (isFree) {
      handleEnrollFree()
    } else {
      handleAddToCart()
    }
  }

  function handleAddToCart() {
    if (!isAuthenticated) {
      requireAuth("add_to_cart")
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await addToCart(courseId)
      if (result && "error" in result && result.error) {
        switch (result.error) {
          case "AUTH_REQUIRED": {
            requireAuth("add_to_cart")
            return
          }
          case "ALREADY_IN_CART":
            setLocalIsInCart(true)
            if (typeof result.cartCount === "number") {
              dispatchCartCountUpdated(result.cartCount)
            }
            return
          case "ALREADY_ENROLLED":
            router.push(`/dashboard/cursos/${slug}`)
            return
          default:
            setError(getCartErrorMessage(result.error))
            if (
              result.error === "COURSE_IS_FREE" ||
              result.error === "COURSE_UNAVAILABLE"
            ) {
              router.refresh()
            }
        }
      } else {
        setLocalIsInCart(true)
        if (typeof result.cartCount === "number") {
          dispatchCartCountUpdated(result.cartCount)
        }
        router.refresh()
      }
    })
  }

  function handleEnrollFree() {
    if (!isAuthenticated) {
      requireAuth("enroll_free")
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await enrollFree(courseId)
      if (result && "error" in result && result.error) {
        if (result.error === "AUTH_REQUIRED") {
          requireAuth("enroll_free")
          return
        }
        setError(result.error)
        if (
          result.error === "Curso no encontrado." ||
          result.error === "Este curso no esta disponible." ||
          result.error === "Este curso no es gratuito."
        ) {
          router.refresh()
        }
      } else {
        router.push(`/dashboard/cursos/${slug}`)
      }
    })
  }

  if (isEnrolled) {
    return (
      <Button
        size="sm"
        variant="secondary"
        asChild
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <Link href={`/dashboard/cursos/${slug}`} prefetch={false}>Ir al curso</Link>
      </Button>
    )
  }

  if (localIsInCart) {
    return (
      <Button size="sm" variant="secondary" disabled>
        <Check className="mr-1 h-3.5 w-3.5" />
        En carrito
      </Button>
    )
  }

  if (isPending) {
    return (
      <Button size="sm" disabled>
        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        {isFree ? "Inscribiendo..." : "Agregando..."}
      </Button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        onClick={handleClick}
        aria-label={
          isFree
            ? `Inscribirse gratis a ${courseTitle}`
            : `Agregar ${courseTitle} al carrito`
        }
      >
        <ShoppingCart className="mr-1 h-3.5 w-3.5" />
        {isFree ? "Gratis" : "Agregar"}
      </Button>
      {error && (
        <p className="max-w-40 text-right text-xs text-destructive" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  )
}
