"use client"

import { useEffect, useState, useTransition } from "react"

import { deleteLesson, reorderLessons } from "@/actions/admin/lessons"
import { refreshCourseMediaStatus } from "@/actions/admin/media"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LessonForm } from "@/components/admin/LessonForm"

import type { Lesson } from "@/types"

interface LessonListProps {
  courseId: string
  initialLessons: Lesson[]
}

/**
 * Editable lesson list for the admin course editor.
 *
 * Features:
 * - Display lessons ordered by sort_order
 * - Move lesson up / down (calls reorderLessons Server Action)
 * - Edit lesson metadata via inline dialog
 * - Delete lesson with confirmation dialog
 */
export function LessonList({ courseId, initialLessons }: LessonListProps) {
  const [lessons, setLessons] = useState<Lesson[]>(initialLessons)
  const [isPending, startTransition] = useTransition()

  // Edit dialog state
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null)

  // Delete dialog state
  const [deletingLesson, setDeletingLesson] = useState<Lesson | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, startDeleteTransition] = useTransition()

  useEffect(() => {
    setLessons(initialLessons)
  }, [initialLessons])

  const shouldPoll = lessons.some(
    (lesson) =>
      lesson.bunny_status === "processing" ||
      lesson.pending_bunny_status === "processing"
  )

  useEffect(() => {
    if (!shouldPoll) return

    const intervalId = window.setInterval(() => {
      startTransition(async () => {
        const result = await refreshCourseMediaStatus(courseId)
        if (result.lessons) {
          setLessons(result.lessons)
        }
      })
    }, 10_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [courseId, shouldPoll, startTransition])

  // ── Reorder ────────────────────────────────────────────────────────────────

  function moveLesson(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= lessons.length) return

    const updated = [...lessons]
    ;[updated[index], updated[targetIndex]] = [
      updated[targetIndex],
      updated[index],
    ]

    // Optimistic update
    setLessons(updated)

    startTransition(async () => {
      const result = await reorderLessons(
        courseId,
        updated.map((l) => l.id)
      )
      if (result.error) {
        // Rollback on failure
        setLessons(lessons)
      }
    })
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  function handleDeleteConfirm() {
    if (!deletingLesson) return
    setDeleteError(null)

    startDeleteTransition(async () => {
      const result = await deleteLesson(deletingLesson.id)

      if (result.error) {
        setDeleteError(result.error)
        return
      }

      setLessons((prev) => prev.filter((l) => l.id !== deletingLesson.id))
      setDeletingLesson(null)
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (lessons.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        Este curso no tiene lecciones. Agrega la primera leccion arriba.
      </div>
    )
  }

  return (
    <>
      <ol className="space-y-2">
        {lessons.map((lesson, index) => (
          <li
            key={lesson.id}
            data-testid={`lesson-row-${lesson.id}`}
            className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
          >
            {/* Sort order indicator */}
            <span className="w-6 shrink-0 text-center text-sm font-semibold text-muted-foreground">
              {index + 1}
            </span>

            {/* Lesson info */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{lesson.title}</p>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {formatDuration(lesson.duration_seconds)}
                </p>
                {lesson.video_upload_error && (
                  <p className="text-xs text-destructive">
                    {lesson.video_upload_error}
                  </p>
                )}
              </div>
            </div>

            {/* is_free badge */}
            {lesson.is_free && (
              <Badge variant="secondary" className="shrink-0 text-xs">
                Gratis
              </Badge>
            )}

            <Badge
              data-testid="lesson-status"
              className={`shrink-0 text-xs ${getLessonStatusBadge(lesson)}`}
            >
              {getLessonStatusLabel(lesson)}
            </Badge>

            {/* Reorder buttons */}
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={isPending || index === 0}
                onClick={() => moveLesson(index, "up")}
                aria-label="Mover leccion arriba"
              >
                &uarr;
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={isPending || index === lessons.length - 1}
                onClick={() => moveLesson(index, "down")}
                aria-label="Mover leccion abajo"
              >
                &darr;
              </Button>
            </div>

            {/* Edit button */}
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setEditingLesson(lesson)}
            >
              Editar
            </Button>

            {/* Delete button */}
            <Button
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setDeleteError(null)
                setDeletingLesson(lesson)
              }}
            >
              Eliminar
            </Button>
          </li>
        ))}
      </ol>

      {/* Edit lesson dialog */}
      <Dialog
        open={editingLesson !== null}
        onOpenChange={(open) => {
          if (!open) setEditingLesson(null)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar leccion</DialogTitle>
            <DialogDescription>
              Actualiza los datos de la leccion. Si reemplazas el video, el
              actual seguira disponible hasta que Bunny termine de procesar el
              nuevo.
            </DialogDescription>
          </DialogHeader>

          {editingLesson && (
            <LessonForm
              courseId={courseId}
              lesson={editingLesson}
              onSuccess={() => {
                startTransition(async () => {
                  const result = await refreshCourseMediaStatus(courseId)
                  if (result.lessons) {
                    setLessons(result.lessons)
                  }
                  setEditingLesson(null)
                })
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deletingLesson !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingLesson(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar leccion</DialogTitle>
            <DialogDescription>
              Vas a eliminar{" "}
              <strong>&quot;{deletingLesson?.title}&quot;</strong>. Esta accion
              eliminara el video de Bunny Stream y el progreso de todos los
              estudiantes en esta leccion. Esta accion es irreversible.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {deleteError}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeletingLesson(null)
                setDeleteError(null)
              }}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? "Eliminando..." : "Confirmar eliminacion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return "Sin duracion"
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, "0")} min`
}

function getLessonStatusLabel(lesson: Lesson): string {
  if (
    lesson.pending_bunny_video_id &&
    lesson.pending_bunny_status === "processing"
  ) {
    return "Reemplazando"
  }

  if (
    lesson.pending_bunny_video_id &&
    lesson.pending_bunny_status === "error"
  ) {
    return "Error"
  }

  if (lesson.bunny_status === "processing") {
    return "Procesando"
  }

  if (lesson.bunny_status === "error") {
    return "Error"
  }

  return "Listo"
}

function getLessonStatusBadge(lesson: Lesson): string {
  const label = getLessonStatusLabel(lesson)

  if (label === "Listo") {
    return "bg-green-600 text-white hover:bg-green-600"
  }

  if (label === "Procesando" || label === "Reemplazando") {
    return "bg-amber-500 text-white hover:bg-amber-500"
  }

  return "bg-destructive text-white hover:bg-destructive"
}
