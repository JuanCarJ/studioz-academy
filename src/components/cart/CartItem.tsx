import Image from "next/image"
import Link from "next/link"

import { removeFromCart } from "@/actions/cart"
import { formatCOP } from "@/lib/utils"
import { Button } from "@/components/ui/button"

import type { CartItemWithCourse } from "@/actions/cart"

export function CartItem({ item }: { item: CartItemWithCourse }) {
  const { course } = item

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
        </div>

        <form action={removeAction}>
          <Button type="submit" variant="ghost" size="sm" className="h-auto p-0 text-destructive hover:text-destructive/80">
            Quitar
          </Button>
        </form>
      </div>

      {/* Price */}
      <div className="flex-shrink-0 text-right font-medium">
        {course.is_free ? "Gratis" : formatCOP(course.price)}
      </div>
    </div>
  )
}
