import Image from "next/image"
import Link from "next/link"

import { removeFromCart } from "@/actions/cart"
import { Badge } from "@/components/ui/badge"
import { isPromotionalFreeCourse } from "@/lib/pricing"
import { formatCOP } from "@/lib/utils"
import { Button } from "@/components/ui/button"

import type { CartItemWithCourse } from "@/actions/cart"

export function CartItem({ item }: { item: CartItemWithCourse }) {
  const { course } = item
  const isPromoFree = isPromotionalFreeCourse({
    is_free: course.is_free,
    current_price: item.finalPrice,
    has_course_discount:
      course.has_course_discount || item.courseDiscountAmount > 0 || item.comboDiscountAmount > 0,
  })

  async function removeAction() {
    "use server"
    await removeFromCart(item.id)
  }

  return (
    <div className="flex gap-4 border-b py-4">
      {/* Thumbnail */}
      <Link
        href={`/cursos/${course.slug}`}
        className="relative h-20 w-32 flex-shrink-0 overflow-hidden rounded-md bg-muted"
      >
        {course.thumbnail_url ? (
          <Image
            src={course.thumbnail_url}
            alt={course.title}
            fill
            className="object-cover"
            sizes="128px"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Sin imagen
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="flex flex-1 flex-col justify-between">
        <div>
          <Link
            href={`/cursos/${course.slug}`}
            className="font-medium hover:underline"
          >
            {course.title}
          </Link>
          {course.instructor && (
            <p className="text-sm text-muted-foreground">
              {course.instructor.full_name}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {item.coursePromotionLabel && (
              <Badge variant="secondary">{item.coursePromotionLabel}</Badge>
            )}
            {item.comboPromotionLabel && (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                {item.comboPromotionLabel}
              </Badge>
            )}
          </div>
          {!course.is_free && (
            <div className="mt-3 space-y-1 text-sm">
              {item.courseDiscountAmount > 0 && (
                <div className="flex gap-2 text-muted-foreground">
                  <span className="line-through">{formatCOP(item.listPrice)}</span>
                  <span>Promo curso -{formatCOP(item.courseDiscountAmount)}</span>
                </div>
              )}
              {item.comboDiscountAmount > 0 && (
                <div className="text-emerald-600">
                  Combo aplicado -{formatCOP(item.comboDiscountAmount)}
                </div>
              )}
            </div>
          )}
        </div>

        <form action={removeAction}>
          <Button type="submit" variant="ghost" size="sm" className="h-auto p-0 text-destructive hover:text-destructive/80">
            Quitar
          </Button>
        </form>
      </div>

      {/* Price */}
      <div className="flex-shrink-0 text-right">
        {course.is_free ? (
          <span className="font-medium">Gratis</span>
        ) : isPromoFree ? (
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground line-through">
              {formatCOP(item.listPrice)}
            </div>
            <div className="font-semibold text-amber-600">Gratis por promo</div>
          </div>
        ) : (
          <div className="space-y-1">
            {item.listPrice !== item.finalPrice && (
              <div className="text-sm text-muted-foreground line-through">
                {formatCOP(item.listPrice)}
              </div>
            )}
            <div className="font-semibold">{formatCOP(item.finalPrice)}</div>
          </div>
        )}
      </div>
    </div>
  )
}
