"use client"

import { useState, useTransition } from "react"

import { deleteCourse } from "@/actions/admin/courses"
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

interface DeleteCourseButtonProps {
  courseId: string
  courseTitle: string
  enrollmentCount: number
}

/**
 * US-033: Delete course button with confirmation dialog.
 *
 * Shows enrollment count warning when students are inscribed.
 * On confirm, calls deleteCourse Server Action which cascades all related data.
 */
export function DeleteCourseButton({
  courseId,
  courseTitle,
  enrollmentCount,
}: DeleteCourseButtonProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const hasEnrollments = enrollmentCount > 0

  function handleConfirm() {
    setError(null)

    startTransition(async () => {
      const result = await deleteCourse(courseId)

      // deleteCourse redirects on success — if we get here, it errored
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) {
          setOpen(next)
          if (!next) setError(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Eliminar
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar curso</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Vas a eliminar el curso{" "}
                <strong className="text-foreground">
                  &quot;{courseTitle}&quot;
                </strong>
                .
              </p>

              {hasEnrollments && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800">
                  <p className="font-semibold">Advertencia</p>
                  <p>
                    Este curso tiene{" "}
                    <strong>
                      {enrollmentCount} estudiante
                      {enrollmentCount !== 1 ? "s" : ""} inscrito
                      {enrollmentCount !== 1 ? "s" : ""}
                    </strong>
                    . Al eliminar el curso se borraran todas sus inscripciones y
                    el progreso de aprendizaje. Los pedidos historicos se
                    conservan.
                  </p>
                </div>
              )}

              <p>
                Esta accion eliminara todas las lecciones y sus videos en Bunny
                Stream. Esta accion es{" "}
                <strong className="text-foreground">irreversible</strong>.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
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
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? "Eliminando..." : "Confirmar eliminacion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
