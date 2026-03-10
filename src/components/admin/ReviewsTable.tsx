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
    <Table className="min-w-[1160px] table-fixed">
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
                  className="hover:underline text-primary line-clamp-2"
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
            <TableCell className="align-top text-sm text-muted-foreground whitespace-nowrap">
              {formatDate(review.created_at)}
            </TableCell>
            <TableCell className="align-top text-right">
              <DeleteButton reviewId={review.id} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
