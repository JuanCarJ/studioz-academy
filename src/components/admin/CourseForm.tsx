"use client"

import { useActionState, useState } from "react"
import Image from "next/image"

import { createCourse, updateCourse } from "@/actions/admin/courses"
import type { CourseActionState } from "@/actions/admin/courses"
import { CoursePreviewManager } from "@/components/admin/CoursePreviewManager"
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
import { formatCOP } from "@/lib/utils"

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
  const [priceValue, setPriceValue] = useState(String(priceInPesos))
  const [isFreeChecked, setIsFreeChecked] = useState(course?.is_free ?? false)
  const [courseDiscountEnabled, setCourseDiscountEnabled] = useState(
    course?.course_discount_enabled ?? false
  )
  const [courseDiscountType, setCourseDiscountType] = useState<
    "percentage" | "fixed"
  >(
    course?.course_discount_type === "fixed" ? "fixed" : "percentage"
  )
  const [courseDiscountValue, setCourseDiscountValue] = useState(
    course?.course_discount_type === "fixed" && course.course_discount_value
      ? String(course.course_discount_value / 100)
      : String(course?.course_discount_value ?? 10)
  )

  const listPriceInCents = isFreeChecked
    ? 0
    : Math.max(0, Math.round(Number(priceValue || 0) * 100))
  const rawDiscountValue = Number(courseDiscountValue || 0)
  const previewDiscountAmount =
    !courseDiscountEnabled || isFreeChecked || !Number.isFinite(rawDiscountValue) || rawDiscountValue <= 0
      ? 0
      : courseDiscountType === "percentage"
        ? Math.min(
            listPriceInCents,
            Math.round((listPriceInCents * rawDiscountValue) / 100)
          )
        : Math.min(listPriceInCents, Math.round(rawDiscountValue * 100))
  const previewFinalPrice = Math.max(0, listPriceInCents - previewDiscountAmount)
  const isFixedDiscountInvalid =
    courseDiscountEnabled &&
    !isFreeChecked &&
    courseDiscountType === "fixed" &&
    Math.round(rawDiscountValue * 100) > listPriceInCents
  const isPercentageDiscountInvalid =
    courseDiscountEnabled &&
    !isFreeChecked &&
    courseDiscountType === "percentage" &&
    (rawDiscountValue < 1 || rawDiscountValue > 100)

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
            value={priceValue}
            onChange={(event) => setPriceValue(event.target.value)}
            placeholder="100000"
            disabled={isFreeChecked}
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
              checked={isFreeChecked}
              onCheckedChange={(checked) => {
                setIsFreeChecked(checked)
                if (checked) {
                  setCourseDiscountEnabled(false)
                }
              }}
            />
            <Label htmlFor="isFree">Curso gratuito</Label>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Promocion del curso</h3>
            <p className="text-xs text-muted-foreground">
              Configura un descuento individual por curso. Los combos se calculan aparte en carrito.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="courseDiscountEnabled"
              name="courseDiscountEnabled"
              checked={courseDiscountEnabled && !isFreeChecked}
              onCheckedChange={setCourseDiscountEnabled}
              disabled={isFreeChecked}
            />
            <Label htmlFor="courseDiscountEnabled">Activar promo</Label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="courseDiscountType">Tipo</Label>
            <Select
              name="courseDiscountType"
              value={courseDiscountType}
              onValueChange={(value) =>
                setCourseDiscountType(value === "fixed" ? "fixed" : "percentage")
              }
              disabled={!courseDiscountEnabled || isFreeChecked}
            >
              <SelectTrigger id="courseDiscountType">
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Porcentaje</SelectItem>
                <SelectItem value="fixed">Monto fijo (COP)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="courseDiscountValue">Valor</Label>
            <Input
              id="courseDiscountValue"
              name="courseDiscountValue"
              type="number"
              min={1}
              max={courseDiscountType === "percentage" ? 100 : undefined}
              value={courseDiscountValue}
              onChange={(event) => setCourseDiscountValue(event.target.value)}
              disabled={!courseDiscountEnabled || isFreeChecked}
            />
            <p className="text-xs text-muted-foreground">
              {courseDiscountType === "percentage"
                ? "Entre 1 y 100."
                : "En pesos colombianos. No puede superar el precio lista actual."}
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <p className="font-medium">Preview de precio</p>
          {isFreeChecked ? (
            <p className="mt-1 text-muted-foreground">
              El curso es gratuito, por lo tanto no puede tener promocion individual activa.
            </p>
          ) : (
            <div className="mt-2 space-y-1 text-muted-foreground">
              <p>Precio lista: {formatCOP(listPriceInCents)}</p>
              <p>Descuento: -{formatCOP(previewDiscountAmount)}</p>
              <p className="font-semibold text-foreground">
                Precio final: {formatCOP(previewFinalPrice)}
              </p>
            </div>
          )}
          {(isFixedDiscountInvalid || isPercentageDiscountInvalid) && (
            <p className="mt-2 text-sm text-destructive">
              {isPercentageDiscountInvalid
                ? "El descuento porcentual debe estar entre 1 y 100."
                : "El descuento fijo no puede superar el precio lista actual."}
            </p>
          )}
        </div>
      </div>

      {/* H-06: Thumbnail image upload */}
      <div className="space-y-2">
        <Label htmlFor="thumbnail">Imagen de portada</Label>
        {course?.thumbnail_url && (
          <div className="mb-2">
            <Image
              src={course.thumbnail_url}
              alt="Portada actual"
              width={256}
              height={144}
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

      {isEditing ? (
        <CoursePreviewManager course={course} />
      ) : (
        <div className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Crea el curso primero y luego agrega la vista previa desde editar
          curso. La portada se configura aqui, pero el preview en video ahora
          se administra desde Bunny.
        </div>
      )}

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
