import Image from "next/image"
import Link from "next/link"

import { formatCOP } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

import type { Course, Instructor } from "@/types"

interface CourseCardProps {
  course: Course & {
    instructor?: Pick<Instructor, "id" | "full_name">
    isNew?: boolean
  }
}

export function CourseCard({ course }: CourseCardProps) {
  const isNew = course.isNew ?? false

  return (
    <Link href={`/cursos/${course.slug}`} className="group block">
      <article className="overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-lg">
        {/* Thumbnail */}
        <div className="relative aspect-video overflow-hidden bg-muted">
          {course.thumbnail_url ? (
            <Image
              src={course.thumbnail_url}
              alt={course.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
          )}

          {/* Overlay badges */}
          <div className="absolute left-2 top-2 flex gap-1.5">
            {course.is_free && (
              <Badge className="bg-green-600 text-white hover:bg-green-600">
                Gratis
              </Badge>
            )}
            {isNew && (
              <Badge className="bg-blue-600 text-white hover:bg-blue-600">
                Nuevo
              </Badge>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <Badge variant="secondary" className="mb-2 text-xs">
            {course.category === "baile" ? "Baile" : "Tatuaje"}
          </Badge>

          <h3 className="line-clamp-2 font-semibold leading-snug">
            {course.title}
          </h3>

          {course.short_description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {course.short_description}
            </p>
          )}

          {course.instructor && (
            <p className="mt-2 text-sm text-muted-foreground">
              {course.instructor.full_name}
            </p>
          )}

          {/* Rating */}
          {course.rating_avg != null && course.reviews_count > 0 && (
            <div className="mt-2 flex items-center gap-1">
              <span className="text-sm font-medium text-amber-600">
                {course.rating_avg.toFixed(1)}
              </span>
              <div className="flex" aria-label={`${course.rating_avg.toFixed(1)} de 5 estrellas`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg
                    key={i}
                    className={`h-3.5 w-3.5 ${
                      i < Math.round(course.rating_avg!) ? "text-amber-400" : "text-muted"
                    }`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                ({course.reviews_count})
              </span>
            </div>
          )}

          {/* Price */}
          <div className="mt-3">
            {course.is_free ? (
              <span className="font-bold text-green-600">Gratis</span>
            ) : (
              <span className="font-bold">{formatCOP(course.price)}</span>
            )}
          </div>
        </div>
      </article>
    </Link>
  )
}
