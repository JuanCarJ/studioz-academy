"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { addToCart } from "@/actions/cart"
import { enrollFree } from "@/actions/enrollments"
import { buildCourseAuthPath, type AuthIntentKind } from "@/lib/auth-intent"
import { dispatchCartCountUpdated } from "@/lib/cart-events"
import { getCartErrorMessage } from "@/lib/cart"
import { Button } from "@/components/ui/button"
import { formatCOP } from "@/lib/utils"

export interface CourseActionsProps {
  courseId: string
  slug: string
  isFree: boolean
  isEnrolled: boolean
  isInCart: boolean
  price: number
  listPrice?: number
  coursePromotionLabel?: string | null
  isAuthenticated: boolean
  enrollmentProgress?: { isCompleted: boolean; hasProgress: boolean } | null
  compact?: boolean
}

function getEnrolledLabel(
  progress?: { isCompleted: boolean; hasProgress: boolean } | null
): string {
  if (progress?.isCompleted) return "Repasar"
  if (progress?.hasProgress) return "Continuar"
  return "Comenzar"
}

export function CourseActions({
  courseId,
  slug,
  isFree,
  isEnrolled,
  isInCart,
  price,
  listPrice,
  coursePromotionLabel,
  isAuthenticated,
  enrollmentProgress,
  compact,
}: CourseActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const isPromotionalFree = isFree && price === 0 && (listPrice ?? 0) > 0

  const btnSize = compact ? "default" : "lg"
  const btnClass = compact ? "" : "w-full"

  function requireAuth(intentKind?: AuthIntentKind) {
    router.push(
      buildCourseAuthPath({
        slug,
        intent: intentKind
          ? {
              kind: intentKind,
              courseId,
            }
          : undefined,
      })
    )
  }

  function shouldRefreshAfterAddToCartError(error: string | undefined) {
    return error === "COURSE_IS_FREE" || error === "COURSE_UNAVAILABLE"
  }

  function shouldRefreshAfterEnrollError(error: string | undefined) {
    return (
      error === "Curso no encontrado." ||
      error === "Este curso no esta disponible." ||
      error === "Este curso no es gratuito."
    )
  }

  function handleAddToCart() {
    if (!isAuthenticated) return requireAuth("add_to_cart")

    setError(null)
    startTransition(async () => {
      const result = await addToCart(courseId)
      if (result && "error" in result) {
        if (result.error === "AUTH_REQUIRED") {
          return requireAuth("add_to_cart")
        }
        if (typeof result.cartCount === "number") {
          dispatchCartCountUpdated(result.cartCount)
        }
        setError(getCartErrorMessage(result.error as string))
        if (shouldRefreshAfterAddToCartError(result.error)) {
          router.refresh()
        }
      } else {
        if (typeof result.cartCount === "number") {
          dispatchCartCountUpdated(result.cartCount)
        }
        router.refresh()
      }
    })
  }

  function handleEnrollFree() {
    if (!isAuthenticated) return requireAuth("enroll_free")

    setError(null)
    startTransition(async () => {
      const result = await enrollFree(courseId)
      if (result && "error" in result) {
        if (result.error === "AUTH_REQUIRED") return requireAuth("enroll_free")
        setError(result.error as string)
        if (shouldRefreshAfterEnrollError(result.error)) {
          router.refresh()
        }
      } else {
        router.push(`/dashboard/cursos/${slug}`)
      }
    })
  }

  if (isEnrolled) {
    const label = getEnrolledLabel(enrollmentProgress)
    return (
      <Button size={btnSize} className={btnClass} asChild>
        <Link href={`/dashboard/cursos/${slug}`} prefetch={false}>
          {label}
        </Link>
      </Button>
    )
  }

  if (isInCart) {
    return (
      <Button size={btnSize} variant="secondary" className={btnClass} asChild>
        <Link href="/carrito" prefetch={false}>Ya en tu carrito</Link>
      </Button>
    )
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {error && (
          <p className="text-sm text-destructive" aria-live="polite">
            {error}
          </p>
        )}
        {(!isFree || isPromotionalFree) && (
          <div className="flex flex-col items-end whitespace-nowrap">
            {listPrice && listPrice > price && (
              <span className="text-xs text-muted-foreground line-through">
                {formatCOP(listPrice)}
              </span>
            )}
            <span className="text-lg font-bold">
              {isPromotionalFree ? "Gratis por promo" : formatCOP(price)}
            </span>
            {coursePromotionLabel && (
              <span className="text-xs text-amber-600">{coursePromotionLabel}</span>
            )}
          </div>
        )}
        <Button
          size="default"
          onClick={isFree ? handleEnrollFree : handleAddToCart}
          disabled={isPending}
        >
          {isPending
            ? isFree
              ? "Inscribiendo..."
              : "Agregando..."
            : isFree
              ? "Inscribirme gratis"
              : "Agregar al carrito"}
        </Button>
      </div>
    )
  }

  return (
      <div className="space-y-3">
      {error && (
        <p className="text-sm text-destructive" aria-live="polite">
          {error}
        </p>
      )}

      {isFree ? (
        <>
          {isPromotionalFree && (
            <div className="space-y-1">
              {listPrice && listPrice > 0 && (
                <div className="text-sm text-muted-foreground line-through">
                  {formatCOP(listPrice)}
                </div>
              )}
              <div className="text-2xl font-bold text-amber-600">Gratis por promo</div>
              {coursePromotionLabel && (
                <div className="text-sm text-amber-600">{coursePromotionLabel}</div>
              )}
            </div>
          )}
          <Button
            size="lg"
            className="w-full"
            onClick={handleEnrollFree}
            disabled={isPending}
          >
            {isPending ? "Inscribiendo..." : "Inscribirme gratis"}
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-1">
            {listPrice && listPrice > price && (
              <div className="text-sm text-muted-foreground line-through">
                {formatCOP(listPrice)}
              </div>
            )}
            <div className="text-2xl font-bold">{formatCOP(price)}</div>
            {coursePromotionLabel && (
              <div className="text-sm text-amber-600">{coursePromotionLabel}</div>
            )}
          </div>
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
