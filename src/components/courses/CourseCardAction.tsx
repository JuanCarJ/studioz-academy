"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Check, Loader2, ShoppingCart } from "lucide-react"

import { addToCart } from "@/actions/cart"
import { enrollFree } from "@/actions/enrollments"
import { getCartErrorMessage } from "@/lib/cart"
import { Button } from "@/components/ui/button"

interface CourseCardActionProps {
  courseId: string
  slug: string
  isFree: boolean
  isInCart: boolean
  isEnrolled: boolean
  isAuthenticated: boolean
}

export function CourseCardAction({
  courseId,
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
      const params = new URLSearchParams({
        redirect: `/cursos/${slug}`,
        addToCart: courseId,
      })
      router.push(`/login?${params.toString()}`)
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await addToCart(courseId)
      if (result && "error" in result && result.error) {
        switch (result.error) {
          case "AUTH_REQUIRED": {
            const params = new URLSearchParams({
              redirect: `/cursos/${slug}`,
              addToCart: courseId,
            })
            router.push(`/login?${params.toString()}`)
            return
          }
          case "ALREADY_IN_CART":
            setLocalIsInCart(true)
            return
          case "ALREADY_ENROLLED":
            router.push(`/dashboard/cursos/${slug}`)
            return
          default:
            setError(getCartErrorMessage(result.error))
        }
      } else {
        setLocalIsInCart(true)
        router.refresh()
      }
    })
  }

  function handleEnrollFree() {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/cursos/${slug}`)
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await enrollFree(courseId)
      if (result && "error" in result && result.error) {
        if (result.error === "AUTH_REQUIRED") {
          router.push(`/login?redirect=/cursos/${slug}`)
          return
        }
        setError(result.error)
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
        <Link href={`/dashboard/cursos/${slug}`}>Ir al curso</Link>
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
    <Button
      size="sm"
      onClick={handleClick}
      title={error ?? undefined}
      aria-label={
        isFree
          ? `Inscribirse gratis a ${slug}`
          : `Agregar al carrito ${slug}`
      }
    >
      <ShoppingCart className="mr-1 h-3.5 w-3.5" />
      {isFree ? "Gratis" : "Agregar"}
    </Button>
  )
}
