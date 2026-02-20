"use client"

import { useRef, useState, useTransition } from "react"

import { createLesson, updateLesson } from "@/actions/admin/lessons"
import type { LessonActionState } from "@/actions/admin/lessons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"

import type { Lesson } from "@/types"

interface LessonFormProps {
  courseId: string
  lesson?: Lesson
  onSuccess?: () => void
}

type UploadPhase = "idle" | "creating" | "uploading" | "done" | "error"

/**
 * Form for creating or editing a lesson.
 *
 * Create flow:
 *   1. Submit form → Server Action creates Bunny entry, returns uploadUrl
 *   2. Component uploads file bytes directly to Bunny PUT endpoint
 *   3. Calls onSuccess when done
 *
 * Edit flow:
 *   1. Submit form → Server Action updates metadata only
 *   2. Calls onSuccess when done
 */
export function LessonForm({ courseId, lesson, onSuccess }: LessonFormProps) {
  const isEditing = !!lesson
  const fileRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<UploadPhase>("idle")
  const [uploadProgress, setUploadProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isLoading = isPending || phase === "creating" || phase === "uploading"

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setErrorMsg(null)
    setUploadProgress(0)

    const form = event.currentTarget
    const formData = new FormData(form)

    startTransition(async () => {
      let result: LessonActionState

      if (isEditing) {
        result = await updateLesson(lesson.id, formData)
      } else {
        setPhase("creating")
        result = await createLesson(courseId, formData)
      }

      if (result.error) {
        setErrorMsg(result.error)
        setPhase("error")
        return
      }

      // For new lessons: upload file bytes directly to Bunny
      if (!isEditing && result.uploadUrl) {
        const file = fileRef.current?.files?.[0]
        if (!file) {
          // No file selected — creation succeeded without upload
          setPhase("done")
          onSuccess?.()
          return
        }

        setPhase("uploading")

        try {
          await uploadToBunnyDirect(result.uploadUrl, file, (progress) => {
            setUploadProgress(progress)
          })
          setPhase("done")
          onSuccess?.()
        } catch {
          setErrorMsg(
            "La leccion fue creada pero el video no pudo ser cargado. Intenta subir el video de nuevo."
          )
          setPhase("error")
        }

        return
      }

      setPhase("done")
      onSuccess?.()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {errorMsg && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700">
          {isEditing
            ? "Leccion actualizada exitosamente."
            : "Leccion creada exitosamente."}
        </div>
      )}

      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="lesson-title">Titulo *</Label>
        <Input
          id="lesson-title"
          name="title"
          required
          defaultValue={lesson?.title ?? ""}
          placeholder="Nombre de la leccion"
          disabled={isLoading}
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="lesson-description">Descripcion</Label>
        <Textarea
          id="lesson-description"
          name="description"
          rows={3}
          defaultValue={lesson?.description ?? ""}
          placeholder="Descripcion opcional de la leccion"
          disabled={isLoading}
        />
      </div>

      {/* Duration (seconds) */}
      <div className="space-y-2">
        <Label htmlFor="lesson-duration">Duracion (segundos)</Label>
        <Input
          id="lesson-duration"
          name="durationSeconds"
          type="number"
          min={0}
          step={1}
          defaultValue={lesson?.duration_seconds ?? ""}
          placeholder="Ej: 360 (para 6 minutos)"
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">
          Opcional. Si no se ingresa, Bunny actualizara la duracion al terminar
          de procesar el video.
        </p>
      </div>

      {/* is_free toggle */}
      <div className="flex items-center gap-3">
        <Switch
          id="lesson-isFree"
          name="isFree"
          defaultChecked={lesson?.is_free ?? false}
          disabled={isLoading}
        />
        <div>
          <Label htmlFor="lesson-isFree" className="font-medium">
            Leccion gratuita
          </Label>
          <p className="text-xs text-muted-foreground">
            Los usuarios sin inscripcion podran ver esta leccion.
          </p>
        </div>
      </div>

      {/* Video upload (create only) */}
      {!isEditing && (
        <div className="space-y-2">
          <Label htmlFor="lesson-video">Archivo de video</Label>
          <Input
            ref={fileRef}
            id="lesson-video"
            name="video"
            type="file"
            accept="video/*"
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground">
            El video se sube directamente a Bunny Stream. Formatos: MP4, MOV,
            AVI, MKV. Maximo recomendado: 4 GB.
          </p>
        </div>
      )}

      {/* Editing: show current video ID */}
      {isEditing && lesson.bunny_video_id && (
        <div className="space-y-1">
          <Label>Video actual</Label>
          <p className="rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground">
            {lesson.bunny_video_id}
          </p>
          <p className="text-xs text-muted-foreground">
            Para reemplazar el video, elimina esta leccion y crea una nueva.
          </p>
        </div>
      )}

      {/* Upload progress bar */}
      {phase === "uploading" && (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Cargando video... {uploadProgress}%
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {phase === "creating" && (
        <p className="text-sm text-muted-foreground">
          Preparando espacio en Bunny Stream...
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={isLoading}>
          {isLoading
            ? phase === "uploading"
              ? "Subiendo video..."
              : phase === "creating"
                ? "Preparando..."
                : "Guardando..."
            : isEditing
              ? "Guardar cambios"
              : "Crear leccion"}
        </Button>
      </div>
    </form>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Upload a file directly to Bunny Stream via XHR so we can track progress.
 * Bunny expects a PUT request with the raw file bytes and the AccessKey header.
 *
 * NOTE: The AccessKey sent here is the BUNNY_API_KEY. This is a server-side
 * secret. The uploadUrl is returned by the Server Action and the actual key
 * is NOT exposed here. The client just does a PUT to the URL without extra
 * auth headers — Bunny authenticates via the signed URL structure from the
 * Server Action. If Bunny requires the AccessKey on the PUT, this should be
 * proxied through a Server Action instead.
 *
 * For now, we PUT directly to the Bunny URL returned by the server. If Bunny
 * rejects unauthenticated PUTs we will route through a Next.js API Route.
 */
async function uploadToBunnyDirect(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100)
        onProgress(percent)
      }
    })

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve()
      } else {
        reject(new Error(`Bunny upload failed with status ${xhr.status}`))
      }
    })

    xhr.addEventListener("error", () => {
      reject(new Error("Bunny upload network error"))
    })

    xhr.open("PUT", uploadUrl)
    xhr.send(file)
  })
}
