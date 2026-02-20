"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { LessonForm } from "@/components/admin/LessonForm"

interface AddLessonDialogProps {
  courseId: string
}

/**
 * Trigger button + dialog wrapper for adding a new lesson to a course.
 *
 * On success, refreshes the page via router.refresh() so the lesson list
 * updates without a full navigation.
 */
export function AddLessonDialog({ courseId }: AddLessonDialogProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  function handleSuccess() {
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Agregar leccion</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar leccion</DialogTitle>
          <DialogDescription>
            Completa los datos de la nueva leccion. El video se cargara
            directamente a Bunny Stream.
          </DialogDescription>
        </DialogHeader>
        <LessonForm courseId={courseId} onSuccess={handleSuccess} />
      </DialogContent>
    </Dialog>
  )
}
