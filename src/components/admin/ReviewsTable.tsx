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

const MAX_TEXT_PREVIEW = 80

function truncate(text: string | null, max: number): string {
  if (!text) return "—"
  return text.length > max ? text.slice(0, max) + "..." : text
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
      aria-label={isVisible ? "Ocultar resena" : "Mostrar resena"}
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
          <DialogTitle>Eliminar resena</DialogTitle>
          <DialogDescription>
            Esta accion es permanente y no se puede deshacer. La resena sera
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
        No hay resenas registradas.
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Curso</TableHead>
          <TableHead>Usuario</TableHead>
          <TableHead>Calificacion</TableHead>
          <TableHead>Comentario</TableHead>
          <TableHead>Visible</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reviews.map((review) => (
          <TableRow key={review.id}>
            <TableCell className="font-medium max-w-[160px]">
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
            <TableCell>{review.user?.full_name ?? "—"}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5">
                <StarRating value={review.rating} mode="display" size="sm" />
                <span className="text-xs text-muted-foreground">
                  ({review.rating})
                </span>
              </div>
            </TableCell>
            <TableCell className="max-w-[200px] text-sm text-muted-foreground">
              {truncate(review.text, MAX_TEXT_PREVIEW)}
            </TableCell>
            <TableCell>
              <VisibilityToggle
                reviewId={review.id}
                initialVisible={review.is_visible}
              />
            </TableCell>
            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
              {formatDate(review.created_at)}
            </TableCell>
            <TableCell className="text-right">
              <DeleteButton reviewId={review.id} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
