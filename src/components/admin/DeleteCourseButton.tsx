"use client"
import { useState, useTransition } from "react"
import { performAdminOperation } from "@/actions/admin/operations"
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

interface Props {
  courseId: string
  courseTitle: string
  enrollmentCount: number
  archived: boolean
}
// Historical filename retained; the action only archives and never deletes content.
export function DeleteCourseButton({
  courseId,
  courseTitle,
  enrollmentCount,
  archived,
}: Props) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <DialogTrigger asChild>
        <Button variant={archived ? "outline" : "destructive"} size="sm">
          {archived ? "Restaurar" : "Archivar"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {archived ? "Restaurar curso" : "Archivar curso"}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Vas a {archived ? "restaurar" : "archivar"}{" "}
                <strong className="text-foreground">{courseTitle}</strong>.
              </p>
              {archived ? (
                <p>
                  El curso volverá a borrador para que puedas revisarlo antes de
                  publicarlo.
                </p>
              ) : (
                <>
                  <p>Dejará de aparecer en el catálogo.</p>
                  {enrollmentCount > 0 && (
                    <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                      {enrollmentCount} estudiante
                      {enrollmentCount === 1 ? " conserva" : "s conservan"} su
                      acceso, compras y progreso.
                    </p>
                  )}
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            variant={archived ? "default" : "destructive"}
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null)
                try {
                  const result = await performAdminOperation({
                    action: archived ? "course.restore" : "course.archive",
                    targetId: courseId,
                    reason: archived
                      ? "Restaurar curso archivado"
                      : "Archivar curso y conservar el acceso histórico",
                  })
                  if (result.error) setError(result.error)
                  else setOpen(false)
                } catch {
                  setError("No pudimos guardar el cambio. Inténtalo de nuevo.")
                }
              })
            }
          >
            {pending
              ? "Guardando…"
              : archived
                ? "Restaurar curso"
                : "Archivar curso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
