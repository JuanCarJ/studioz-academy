"use client"

import { useActionState } from "react"

import { createCourse, updateCourse } from "@/actions/admin/courses"
import type { CourseActionState } from "@/actions/admin/courses"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import type { Course, Instructor } from "@/types"

interface CourseFormProps {
  course?: Course
  instructors: Pick<Instructor, "id" | "full_name">[]
}

export function CourseForm({ course, instructors }: CourseFormProps) {
  const isEditing = !!course

  const boundAction = isEditing
    ? updateCourse.bind(null, course.id)
    : createCourse

  const [state, formAction, isPending] = useActionState<
    CourseActionState,
    FormData
  >(boundAction, {})

  // Price display: stored as centavos, shown as pesos
  const priceInPesos = course ? course.price / 100 : ""

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      {state.error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700">
          Curso actualizado exitosamente.
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Titulo *</Label>
        <Input
          id="title"
          name="title"
          defaultValue={course?.title ?? ""}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="shortDescription">Descripcion corta</Label>
        <Input
          id="shortDescription"
          name="shortDescription"
          defaultValue={course?.short_description ?? ""}
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripcion completa</Label>
        <Textarea
          id="description"
          name="description"
          rows={5}
          defaultValue={course?.description ?? ""}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">Categoria *</Label>
          <Select name="category" defaultValue={course?.category ?? ""}>
            <SelectTrigger id="category">
              <SelectValue placeholder="Seleccionar categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="baile">Baile</SelectItem>
              <SelectItem value="tatuaje">Tatuaje</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="instructorId">Instructor *</Label>
          <Select
            name="instructorId"
            defaultValue={course?.instructor_id ?? ""}
          >
            <SelectTrigger id="instructorId">
              <SelectValue placeholder="Seleccionar instructor" />
            </SelectTrigger>
            <SelectContent>
              {instructors.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="price">Precio (COP pesos)</Label>
          <Input
            id="price"
            name="price"
            type="number"
            min={0}
            step={100}
            defaultValue={priceInPesos}
            placeholder="100000"
          />
          <p className="text-xs text-muted-foreground">
            Ingresa el precio en pesos colombianos (ej: 100000 = $100.000)
          </p>
        </div>

        <div className="flex items-end gap-3 pb-1">
          <div className="flex items-center gap-2">
            <Switch
              id="isFree"
              name="isFree"
              defaultChecked={course?.is_free ?? false}
            />
            <Label htmlFor="isFree">Curso gratuito</Label>
          </div>
        </div>
      </div>

      {/* H-06: Thumbnail image upload */}
      <div className="space-y-2">
        <Label htmlFor="thumbnail">Imagen de portada</Label>
        {course?.thumbnail_url && (
          <div className="mb-2">
            <img
              src={course.thumbnail_url}
              alt="Portada actual"
              className="h-32 w-auto rounded-md border object-cover"
            />
          </div>
        )}
        <Input
          id="thumbnail"
          name="thumbnail"
          type="file"
          accept="image/jpeg,image/png,image/webp"
        />
        <p className="text-xs text-muted-foreground">
          JPG, PNG o WebP. Maximo 2 MB. Resolucion recomendada: 1280x720.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="previewVideoUrl">URL video preview (opcional)</Label>
        <Input
          id="previewVideoUrl"
          name="previewVideoUrl"
          type="url"
          placeholder="https://..."
          defaultValue={course?.preview_video_url ?? ""}
        />
      </div>

      {isEditing && (
        <div className="flex items-center gap-2 rounded-lg border p-4">
          <Switch
            id="isPublished"
            name="isPublished"
            defaultChecked={course.is_published}
          />
          <Label htmlFor="isPublished" className="font-medium">
            Publicado
          </Label>
          <span className="text-sm text-muted-foreground">
            {course.is_published
              ? "El curso es visible en el catalogo."
              : "El curso esta oculto del catalogo."}
          </span>
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? isEditing
              ? "Guardando..."
              : "Creando..."
            : isEditing
              ? "Guardar cambios"
              : "Crear curso"}
        </Button>
      </div>
    </form>
  )
}
