"use client"

import { useState, useTransition } from "react"

import { createReview, updateReview, deleteReview } from "@/actions/reviews"
import { StarRating } from "@/components/courses/StarRating"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import type { Review } from "@/types"

const MAX_TEXT_LENGTH = 500

interface ReviewFormProps {
  courseId: string
  existingReview?: Review | null
}

export function ReviewForm({ courseId, existingReview }: ReviewFormProps) {
  const [rating, setRating] = useState<number>(existingReview?.rating ?? 0)
  const [text, setText] = useState<string>(existingReview?.text ?? "")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isEditing = !!existingReview

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (rating === 0) {
      setError("Por favor selecciona una calificacion.")
      return
    }

    const formData = new FormData()
    formData.set("rating", String(rating))
    formData.set("text", text)

    startTransition(async () => {
      const result = isEditing
        ? await updateReview(existingReview.id, formData)
        : await createReview(courseId, formData)

      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(
          isEditing
            ? "Tu resena fue actualizada."
            : "Tu resena fue publicada. Gracias por tu opinion."
        )
      }
    })
  }

  function handleDelete() {
    if (!existingReview) return
    setError(null)
    setSuccess(null)

    startTransition(async () => {
      const result = await deleteReview(existingReview.id)
      if (result.error) {
        setError(result.error)
      } else {
        setSuccess("Tu resena fue eliminada.")
        setRating(0)
        setText("")
      }
    })
  }

  const charsLeft = MAX_TEXT_LENGTH - text.length

  return (
    <div className="rounded-lg border p-5 space-y-4">
      <h3 className="text-base font-semibold">
        {isEditing ? "Tu resena" : "Deja tu resena"}
      </h3>

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Calificacion *</Label>
          <StarRating
            value={rating}
            onChange={setRating}
            mode="input"
            size="md"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="review-text">
            Comentario{" "}
            <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Textarea
            id="review-text"
            name="text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
            placeholder="Cuéntanos tu experiencia con este curso..."
            rows={3}
            className="resize-none"
          />
          <p
            className={`text-xs text-right ${charsLeft < 50 ? "text-amber-600" : "text-muted-foreground"}`}
          >
            {charsLeft} caracteres restantes
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending || rating === 0}>
            {isPending
              ? "Guardando..."
              : isEditing
                ? "Guardar cambios"
                : "Publicar resena"}
          </Button>

          {isEditing && (
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={handleDelete}
            >
              Eliminar
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
