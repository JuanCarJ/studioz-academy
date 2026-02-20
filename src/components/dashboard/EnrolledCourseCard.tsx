import Image from "next/image"
import Link from "next/link"
import { BookOpen, Palette, Clock } from "lucide-react"

import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import type { EnrolledCourseWithProgress } from "@/actions/progress"

interface EnrolledCourseCardProps {
  item: EnrolledCourseWithProgress
}

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Hoy"
  if (diffDays === 1) return "Ayer"
  if (diffDays < 7) return `Hace ${diffDays} dias`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `Hace ${weeks} ${weeks === 1 ? "semana" : "semanas"}`
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `Hace ${months} ${months === 1 ? "mes" : "meses"}`
  }
  return date.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })
}

function getCourseButtonLabel(percentage: number, isCompleted: boolean): string {
  if (isCompleted) return "Repasar"
  if (percentage > 0) return "Continuar"
  return "Comenzar"
}

export function EnrolledCourseCard({ item }: EnrolledCourseCardProps) {
  const { course, progress, enrolledAt } = item
  const { percentage, isCompleted, completedLessons, totalLessons, lastAccessedAt } = progress

  const buttonLabel = getCourseButtonLabel(percentage, isCompleted)
  const courseUrl = `/dashboard/cursos/${course.slug}`
  const hasBeenAccessed = lastAccessedAt !== enrolledAt

  const categoryLabel = course.category === "baile" ? "Baile" : "Tatuaje"
  const CategoryIcon = course.category === "baile" ? BookOpen : Palette

  return (
    <Card className="overflow-hidden py-0 gap-0 transition-shadow hover:shadow-md">
      {/* Thumbnail */}
      <div className="relative aspect-video w-full bg-muted flex-shrink-0">
        {course.thumbnail_url ? (
          <Image
            src={course.thumbnail_url}
            alt={course.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center",
              course.category === "baile"
                ? "bg-blue-50 dark:bg-blue-950/30"
                : "bg-purple-50 dark:bg-purple-950/30"
            )}
          >
            <CategoryIcon
              className={cn(
                "h-12 w-12",
                course.category === "baile"
                  ? "text-blue-400 dark:text-blue-600"
                  : "text-purple-400 dark:text-purple-600"
              )}
            />
          </div>
        )}

        {/* Category badge overlay */}
        <div className="absolute left-2 top-2">
          <Badge
            className={cn(
              "text-xs",
              course.category === "baile"
                ? "bg-blue-600 text-white border-transparent"
                : "bg-purple-600 text-white border-transparent"
            )}
          >
            {categoryLabel}
          </Badge>
        </div>

        {/* Free badge overlay */}
        {course.is_free && (
          <div className="absolute right-2 top-2">
            <Badge className="bg-emerald-600 text-white border-transparent text-xs">
              Gratis
            </Badge>
          </div>
        )}
      </div>

      {/* Card body */}
      <CardContent className="flex flex-col gap-3 pt-4 pb-0">
        {/* Title and instructor */}
        <div className="space-y-1">
          <h3 className="font-semibold leading-snug line-clamp-2 text-sm">
            {course.title}
          </h3>
          {course.instructor && (
            <p className="text-xs text-muted-foreground">
              {course.instructor.full_name}
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isCompleted ? "bg-emerald-500" : "bg-primary"
              )}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {totalLessons === 0
                ? "Sin lecciones"
                : `${completedLessons} de ${totalLessons} lecciones`}
            </p>
            <span
              className={cn(
                "text-xs font-medium",
                isCompleted ? "text-emerald-600 dark:text-emerald-500" : "text-foreground"
              )}
            >
              {percentage}%
            </span>
          </div>
        </div>

        {/* Completed badge */}
        {isCompleted && (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 w-fit text-xs">
            Completado
          </Badge>
        )}
      </CardContent>

      {/* Footer */}
      <CardFooter className="flex items-center justify-between gap-2 pt-4 pb-4 border-t mt-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
          <Clock className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">
            {hasBeenAccessed
              ? formatRelativeDate(lastAccessedAt)
              : `Inscrito ${formatRelativeDate(enrolledAt)}`}
          </span>
        </div>
        <Button asChild size="sm" variant={isCompleted ? "outline" : "default"} className="flex-shrink-0">
          <Link href={courseUrl}>{buttonLabel}</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
