"use client"

import { useState, useTransition } from "react"

import { moderateReview, deleteReviewAdmin } from "@/actions/admin/reviews"
import { StarRating } from "@/components/courses/StarRating"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import type { AdminReview } from "@/actions/admin/reviews"

interface ReviewsTableProps {
  reviews: AdminReview[]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function VisibilityToggle({
  reviewId,
  initialVisible,
}: {
  reviewId: string
  initialVisible: boolean
}) {
  const [isVisible, setIsVisible] = useState(initialVisible)
  const [isPending, startTransition] = useTransition()

  function handleToggle(checked: boolean) {
    setIsVisible(checked)
    startTransition(async () => {
      const result = await moderateReview(reviewId, checked)
      if (result.error) {
        // Revert optimistic update on error
        setIsVisible(!checked)
      }
    })
  }

  return (
    <Switch
      checked={isVisible}
      onCheckedChange={handleToggle}
      disabled={isPending}
      aria-label={isVisible ? "Ocultar reseña" : "Mostrar reseña"}
    />
  )
}

function DeleteButton({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result = await deleteReviewAdmin(reviewId)
      if (result.error) {
        setError(result.error)
      } else {
        setOpen(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Eliminar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar reseña</DialogTitle>
          <DialogDescription>
            Esta acción es permanente y no se puede deshacer. La reseña será
            eliminada definitivamente.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? "Eliminando..." : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ReviewsTable({ reviews }: ReviewsTableProps) {
  if (reviews.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No hay reseñas registradas.
      </p>
    )
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {reviews.map((review) => (
          <div key={review.id} className="rounded-xl border bg-card p-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Curso
              </p>
              {review.course ? (
                <a
                  href={`/cursos/${review.course.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  {review.course.title}
                </a>
              ) : (
                <p className="font-medium">—</p>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Usuario
                </p>
                <p className="mt-1">{review.user?.full_name ?? "—"}</p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Calificación
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StarRating value={review.rating} mode="display" size="sm" />
                  <span className="text-xs text-muted-foreground">
                    ({review.rating})
                  </span>
                </div>
              </div>

              <div className="min-[420px]:col-span-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Comentario
                </p>
                <p className="mt-1 line-clamp-4 text-sm leading-6 text-muted-foreground">
                  {review.text?.trim() || "—"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Fecha
                </p>
                <p className="mt-1 text-muted-foreground">
                  {formatDate(review.created_at)}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Visible</span>
                <VisibilityToggle
                  reviewId={review.id}
                  initialVisible={review.is_visible}
                />
              </div>
              <DeleteButton reviewId={review.id} />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden rounded-lg border md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[18%]">Curso</TableHead>
              <TableHead className="w-[20%]">Usuario</TableHead>
              <TableHead className="w-[13%]">Calificación</TableHead>
              <TableHead className="w-[27%]">Comentario</TableHead>
              <TableHead className="w-[8%] text-center">Visible</TableHead>
              <TableHead className="w-[8%]">Fecha</TableHead>
              <TableHead className="w-[6%] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.map((review) => (
              <TableRow key={review.id}>
                <TableCell className="align-top font-medium whitespace-normal break-words">
                  {review.course ? (
                    <a
                      href={`/cursos/${review.course.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline line-clamp-2"
                    >
                      {review.course.title}
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="align-top whitespace-normal break-words">
                  {review.user?.full_name ?? "—"}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StarRating value={review.rating} mode="display" size="sm" />
                    <span className="text-xs text-muted-foreground">
                      ({review.rating})
                    </span>
                  </div>
                </TableCell>
                <TableCell
                  className="align-top whitespace-normal break-words text-sm leading-6 text-muted-foreground"
                  title={review.text ?? ""}
                >
                  {review.text?.trim() || "—"}
                </TableCell>
                <TableCell className="align-top text-center">
                  <div className="flex justify-center">
                    <VisibilityToggle
                      reviewId={review.id}
                      initialVisible={review.is_visible}
                    />
                  </div>
                </TableCell>
                <TableCell className="align-top whitespace-nowrap text-sm text-muted-foreground">
                  {formatDate(review.created_at)}
                </TableCell>
                <TableCell className="align-top text-right">
                  <DeleteButton reviewId={review.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
