"use client"

import { useEffect, useRef, useState, useTransition } from "react"

import {
  commitCoursePreviewUpload,
  discardCoursePreviewUpload,
  prepareCoursePreviewUpload,
} from "@/actions/admin/courses"
import { refreshCourseMediaStatus } from "@/actions/admin/media"
import { uploadToBunnyProxy } from "@/components/admin/bunny-upload"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import type { Course } from "@/types"

type UploadPhase = "idle" | "preparing" | "uploading" | "done" | "error"

interface CoursePreviewManagerProps {
  course: Course
}

export function CoursePreviewManager({ course }: CoursePreviewManagerProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  const [currentCourse, setCurrentCourse] = useState(course)
  const [phase, setPhase] = useState<UploadPhase>("idle")
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setCurrentCourse(course)
  }, [course])

  const status = getPreviewStatus(currentCourse, phase)
  const isBusy = isPending || phase === "preparing" || phase === "uploading"
  const shouldPoll =
    currentCourse.preview_status === "processing" ||
    currentCourse.pending_preview_status === "processing"

  useEffect(() => {
    if (!shouldPoll) return

    const intervalId = window.setInterval(() => {
      startTransition(async () => {
        const result = await refreshCourseMediaStatus(currentCourse.id)
        if (result.course) {
          setCurrentCourse(result.course)
        }
      })
    }, 10_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [
    currentCourse.id,
    currentCourse.pending_preview_status,
    currentCourse.preview_status,
    shouldPoll,
  ])

  function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setErrorMsg("Debes seleccionar un archivo para la vista previa.")
      return
    }

    setErrorMsg(null)
    setSuccessMsg(null)
    setProgress(0)

    startTransition(async () => {
      setPhase("preparing")

      const prepareResult = await prepareCoursePreviewUpload(currentCourse.id)
      if (
        prepareResult.error ||
        !prepareResult.uploadUrl ||
        !prepareResult.videoId
      ) {
        setErrorMsg(
          prepareResult.error ?? "No se pudo preparar la vista previa en Bunny."
        )
        setPhase("error")
        return
      }

      setPhase("uploading")

      try {
        await uploadToBunnyProxy(prepareResult.uploadUrl, file, setProgress)
      } catch {
        await discardCoursePreviewUpload(currentCourse.id, prepareResult.videoId)
        setErrorMsg(
          "No se pudo cargar el archivo. La vista previa anterior se mantuvo sin cambios."
        )
        setPhase("error")
        return
      }

      const commitResult = await commitCoursePreviewUpload(
        currentCourse.id,
        prepareResult.videoId
      )

      if (commitResult.error) {
        await discardCoursePreviewUpload(currentCourse.id, prepareResult.videoId)
        setErrorMsg(commitResult.error)
        setPhase("error")
        return
      }

      setCurrentCourse(
        buildOptimisticPreviewCourse(currentCourse, prepareResult.videoId)
      )

      if (fileRef.current) {
        fileRef.current.value = ""
      }

      setPhase("done")
      setSuccessMsg(
        "Archivo subido. Bunny esta procesando la vista previa del curso."
      )
    })
  }

  return (
    <div
      data-testid="course-preview-manager"
      className="space-y-4 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Vista previa del curso</h3>
            <Badge
              data-testid="course-preview-status"
              className={status.badgeClass}
            >
              {status.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{status.description}</p>
        </div>
      </div>

      {currentCourse.preview_upload_error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {currentCourse.preview_upload_error}
        </div>
      )}

      {errorMsg && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700">
          {successMsg}
        </div>
      )}

      <div className="grid gap-3 rounded-lg bg-muted/30 p-3 text-sm">
        {currentCourse.preview_bunny_video_id ? (
          <div className="space-y-1">
            <p className="font-medium">Preview activo en Bunny</p>
            <p className="font-mono text-xs text-muted-foreground">
              {currentCourse.preview_bunny_video_id}
            </p>
          </div>
        ) : null}

        {currentCourse.preview_video_url ? (
          <div className="space-y-1">
            <p className="font-medium">Preview legacy actual</p>
            <p className="truncate text-xs text-muted-foreground">
              {currentCourse.preview_video_url}
            </p>
          </div>
        ) : null}

        {currentCourse.pending_preview_bunny_video_id ? (
          <div className="space-y-1">
            <p className="font-medium">Preview pendiente</p>
            <p className="font-mono text-xs text-muted-foreground">
              {currentCourse.pending_preview_bunny_video_id}
            </p>
          </div>
        ) : null}

        {!currentCourse.preview_bunny_video_id && !currentCourse.preview_video_url ? (
          <p className="text-muted-foreground">
            Este curso todavia no tiene una vista previa configurada.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="course-preview-upload">Archivo de vista previa</Label>
        <Input
          ref={fileRef}
          id="course-preview-upload"
          type="file"
          accept="video/*"
          disabled={isBusy}
        />
        <p className="text-xs text-muted-foreground">
          Sube un archivo real a Bunny. Si ya existe una vista previa, seguira
          visible hasta que la nueva termine de procesarse.
        </p>
      </div>

      {phase === "preparing" && (
        <p className="text-sm text-muted-foreground">
          Preparando espacio en Bunny Stream...
        </p>
      )}

      {phase === "uploading" && (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Subiendo archivo... {progress}%
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <Button type="button" disabled={isBusy} onClick={handleUpload}>
        {isBusy
          ? phase === "uploading"
            ? "Subiendo archivo..."
            : "Preparando..."
          : currentCourse.preview_bunny_video_id || currentCourse.preview_video_url
            ? "Reemplazar vista previa"
            : "Subir vista previa"}
      </Button>
    </div>
  )
}

function buildOptimisticPreviewCourse(course: Course, videoId: string): Course {
  if (course.preview_bunny_video_id || course.preview_video_url) {
    return {
      ...course,
      pending_preview_bunny_video_id: videoId,
      pending_preview_status: "processing",
      preview_upload_error: null,
    }
  }

  return {
    ...course,
    preview_bunny_video_id: videoId,
    preview_status: "processing",
    preview_upload_error: null,
  }
}

function getPreviewStatus(course: Course, phase: UploadPhase): {
  label: string
  description: string
  badgeClass: string
} {
  const hasCurrentPreview = !!(
    course.preview_bunny_video_id || course.preview_video_url
  )

  if (phase === "preparing") {
    return hasCurrentPreview
      ? {
          label: "Reemplazando",
          description:
            "Preparando la nueva vista previa en Bunny. La actual sigue activa.",
          badgeClass: "bg-amber-500 text-white hover:bg-amber-500",
        }
      : {
          label: "Preparando",
          description: "Preparando espacio en Bunny para la vista previa.",
          badgeClass: "bg-amber-500 text-white hover:bg-amber-500",
        }
  }

  if (phase === "uploading") {
    return hasCurrentPreview
      ? {
          label: "Reemplazando",
          description:
            "Subiendo la nueva vista previa. La actual seguira visible hasta que Bunny termine de procesarla.",
          badgeClass: "bg-amber-500 text-white hover:bg-amber-500",
        }
      : {
          label: "Subiendo",
          description:
            "Subiendo el archivo a Bunny. Aun no esta listo para reproducirse.",
          badgeClass: "bg-amber-500 text-white hover:bg-amber-500",
        }
  }

  if (
    course.pending_preview_bunny_video_id &&
    course.pending_preview_status === "processing"
  ) {
    return {
      label: "Reemplazando",
      description:
        "La vista previa actual sigue activa mientras Bunny procesa la nueva.",
      badgeClass: "bg-amber-500 text-white hover:bg-amber-500",
    }
  }

  if (
    course.pending_preview_bunny_video_id &&
    course.pending_preview_status === "error"
  ) {
    return {
      label: "Error",
      description:
        "El nuevo preview fallo en Bunny. La vista previa anterior se mantuvo.",
      badgeClass: "bg-destructive text-white hover:bg-destructive",
    }
  }

  if (course.preview_bunny_video_id && course.preview_status === "ready") {
    return {
      label: "Listo",
      description: "La vista previa administrada por Bunny ya es reproducible.",
      badgeClass: "bg-green-600 text-white hover:bg-green-600",
    }
  }

  if (course.preview_bunny_video_id && course.preview_status === "processing") {
    return {
      label: "Procesando",
      description:
        "El archivo ya se subio. Bunny todavia lo esta procesando antes de publicarlo.",
      badgeClass: "bg-amber-500 text-white hover:bg-amber-500",
    }
  }

  if (course.preview_bunny_video_id && course.preview_status === "error") {
    return {
      label: "Error",
      description: "Bunny reporto un error al procesar la vista previa activa.",
      badgeClass: "bg-destructive text-white hover:bg-destructive",
    }
  }

  if (course.preview_video_url) {
    return {
      label: "Legacy",
      description:
        "Este curso sigue usando una URL manual. Puedes reemplazarla por un preview administrado en Bunny.",
      badgeClass: "bg-slate-600 text-white hover:bg-slate-600",
    }
  }

  return {
    label: "Sin preview",
    description:
      "Crea el curso y luego sube la vista previa desde esta pantalla de edicion.",
    badgeClass: "",
  }
}
