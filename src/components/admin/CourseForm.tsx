"use client"

import { useActionState, useState } from "react"
import Image from "next/image"

import {
  createCourse,
  type HomeFeaturedAssignment,
  updateCourse,
  type CourseActionState,
  type CourseFieldName,
} from "@/actions/admin/courses"
import { Checkbox } from "@/components/ui/checkbox"
import { CopCurrencyInput } from "@/components/admin/CopCurrencyInput"
import { CoursePreviewManager } from "@/components/admin/CoursePreviewManager"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  COP_MAX_PESOS,
  COURSE_DESCRIPTION_MAX_LENGTH,
  COURSE_SHORT_DESCRIPTION_MAX_LENGTH,
  COURSE_SHORT_DESCRIPTION_MIN_LENGTH,
  COURSE_TITLE_MAX_LENGTH,
  COURSE_TITLE_MIN_LENGTH,
  getLengthError,
  parseCopInput,
  parseWholeNumberInput,
  validateImageFile,
} from "@/lib/admin-form-utils"
import { formatCOP } from "@/lib/utils"

import type { Course, Instructor } from "@/types"

interface CourseFormProps {
  course?: Course
  instructors: Pick<Instructor, "id" | "full_name">[]
  homeFeaturedAssignments?: HomeFeaturedAssignment[]
}

type CourseFieldErrors = NonNullable<CourseActionState["fieldErrors"]>

const MAX_THUMBNAIL_SIZE = 2 * 1024 * 1024
const ALLOWED_THUMBNAIL_TYPES = ["image/jpeg", "image/png", "image/webp"]

function getClientCourseFieldErrors(input: {
  title: string
  shortDescription: string
  description: string
  category: string
  instructorId: string
  homeFeaturedPosition: string
  replaceHomeFeatured: boolean
  selectedOccupiedTitle?: string
  priceValue: string
  isFree: boolean
  isPublished: boolean
  courseDiscountEnabled: boolean
  courseDiscountType: "percentage" | "fixed"
  courseDiscountValue: string
  thumbnailFile: File | null
}) {
  const fieldErrors: CourseFieldErrors = {}
  const title = input.title.trim().replace(/\s+/g, " ")
  const shortDescription = input.shortDescription.trim().replace(/\s+/g, " ")
  const description = input.description.trim().replace(/\s+/g, " ")

  const titleError = getLengthError({
    value: title,
    label: "El titulo",
    required: true,
    min: COURSE_TITLE_MIN_LENGTH,
    max: COURSE_TITLE_MAX_LENGTH,
  })
  if (titleError) {
    fieldErrors.title = titleError
  }

  if (shortDescription) {
    const shortDescriptionError = getLengthError({
      value: shortDescription,
      label: "La descripcion corta",
      min: COURSE_SHORT_DESCRIPTION_MIN_LENGTH,
      max: COURSE_SHORT_DESCRIPTION_MAX_LENGTH,
    })
    if (shortDescriptionError) {
      fieldErrors.shortDescription = shortDescriptionError
    }
  }

  if (description) {
    const descriptionError = getLengthError({
      value: description,
      label: "La descripcion completa",
      max: COURSE_DESCRIPTION_MAX_LENGTH,
    })
    if (descriptionError) {
      fieldErrors.description = descriptionError
    }
  }

  if (!input.category) {
    fieldErrors.category = "Selecciona una categoria."
  }

  if (!input.instructorId) {
    fieldErrors.instructorId = "Selecciona un instructor."
  }

  if (
    input.isPublished &&
    !["none", "1", "2", "3", "4"].includes(input.homeFeaturedPosition)
  ) {
    fieldErrors.homeFeaturedPosition =
      "Selecciona una posicion valida para home."
  }

  if (input.isPublished && input.selectedOccupiedTitle && !input.replaceHomeFeatured) {
    fieldErrors.homeFeaturedPosition =
      "Confirma el reemplazo para ocupar esa posicion en el home."
  }

  if (!input.isFree) {
    const parsedPrice = parseCopInput(input.priceValue, {
      label: "El precio",
      required: true,
      minPesos: 1,
      maxPesos: COP_MAX_PESOS,
    })
    if (parsedPrice.error) {
      fieldErrors.price = parsedPrice.error
    }
  }

  const thumbnailError = validateImageFile(input.thumbnailFile, {
    label: "La portada",
    allowedTypes: ALLOWED_THUMBNAIL_TYPES,
    maxSizeBytes: MAX_THUMBNAIL_SIZE,
  })
  if (thumbnailError) {
    fieldErrors.thumbnail = thumbnailError
  }

  if (input.courseDiscountEnabled && !input.isFree) {
    if (input.courseDiscountType === "percentage") {
      const parsedPercentage = parseWholeNumberInput(input.courseDiscountValue, {
        label: "El descuento porcentual",
        required: true,
        min: 1,
        max: 100,
      })

      if (parsedPercentage.error) {
        fieldErrors.courseDiscountValue = parsedPercentage.error
      }
    } else {
      const parsedPrice = parseCopInput(input.priceValue, {
        label: "El precio",
        required: true,
        minPesos: 1,
        maxPesos: COP_MAX_PESOS,
      })
      const parsedDiscount = parseCopInput(input.courseDiscountValue, {
        label: "El descuento fijo",
        required: true,
        minPesos: 1,
        maxPesos: parsedPrice.pesos ?? COP_MAX_PESOS,
      })

      if (parsedDiscount.error) {
        fieldErrors.courseDiscountValue = parsedDiscount.error
      } else if (
        typeof parsedPrice.pesos === "number" &&
        typeof parsedDiscount.pesos === "number" &&
        parsedDiscount.pesos > parsedPrice.pesos
      ) {
        fieldErrors.courseDiscountValue =
          "El descuento fijo no puede superar el precio lista actual."
      }
    }
  }

  return fieldErrors
}

function FieldErrorText({ message }: { message?: string }) {
  if (!message) return null

  return <p className="text-sm text-destructive">{message}</p>
}

export function CourseForm({
  course,
  instructors,
  homeFeaturedAssignments = [],
}: CourseFormProps) {
  const isEditing = !!course

  const boundAction = isEditing
    ? updateCourse.bind(null, course.id)
    : createCourse

  const [state, formAction, isPending] = useActionState<
    CourseActionState,
    FormData
  >(boundAction, {})

  const [didSubmit, setDidSubmit] = useState(false)
  const [touchedFields, setTouchedFields] = useState<
    Partial<Record<CourseFieldName, boolean>>
  >({})
  const [dirtyFields, setDirtyFields] = useState<
    Partial<Record<CourseFieldName, boolean>>
  >({})

  const [title, setTitle] = useState(course?.title ?? "")
  const [shortDescription, setShortDescription] = useState(
    course?.short_description ?? ""
  )
  const [description, setDescription] = useState(course?.description ?? "")
  const [category, setCategory] = useState(course?.category ?? "")
  const [instructorId, setInstructorId] = useState(course?.instructor_id ?? "")
  const [homeFeaturedPosition, setHomeFeaturedPosition] = useState(
    course?.home_featured_position ? String(course.home_featured_position) : "none"
  )
  const [replaceHomeFeatured, setReplaceHomeFeatured] = useState(false)
  const [priceValue, setPriceValue] = useState(
    course ? String(Math.round(course.price / 100)) : ""
  )
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [isFreeChecked, setIsFreeChecked] = useState(course?.is_free ?? false)
  const [isPublishedChecked, setIsPublishedChecked] = useState(
    course?.is_published ?? false
  )
  const [courseDiscountEnabled, setCourseDiscountEnabled] = useState(
    course?.course_discount_enabled ?? false
  )
  const [courseDiscountType, setCourseDiscountType] = useState<
    "percentage" | "fixed"
  >(course?.course_discount_type === "fixed" ? "fixed" : "percentage")
  const [courseDiscountValue, setCourseDiscountValue] = useState(
    course?.course_discount_type === "fixed" && course.course_discount_value
      ? String(Math.round(course.course_discount_value / 100))
      : String(course?.course_discount_value ?? 10)
  )

  const featuredAssignmentsMap = new Map(
    homeFeaturedAssignments.map((assignment) => [String(assignment.position), assignment])
  )
  const selectedAssignment =
    homeFeaturedPosition === "none"
      ? null
      : featuredAssignmentsMap.get(homeFeaturedPosition) ?? null
  const selectedPositionNumber =
    homeFeaturedPosition === "none" ? null : Number(homeFeaturedPosition)
  const selectedPositionLabel =
    selectedPositionNumber === null
      ? "No destacar"
      : selectedPositionNumber === 1
        ? "Hero (1)"
        : `Destacado ${selectedPositionNumber}`
  const selectedOccupiedByAnotherCourse =
    Boolean(selectedAssignment) && selectedAssignment?.id !== course?.id
  const selectedOccupiedTitle = selectedOccupiedByAnotherCourse
    ? selectedAssignment?.title
    : undefined

  const clientFieldErrors = getClientCourseFieldErrors({
    title,
    shortDescription,
    description,
    category,
    instructorId,
    homeFeaturedPosition,
    replaceHomeFeatured,
    selectedOccupiedTitle,
    priceValue,
    isFree: isFreeChecked,
    isPublished: isPublishedChecked,
    courseDiscountEnabled,
    courseDiscountType,
    courseDiscountValue,
    thumbnailFile,
  })

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

  function markTouched(field: CourseFieldName) {
    setTouchedFields((current) =>
      current[field] ? current : { ...current, [field]: true }
    )
  }

  function markDirty(field: CourseFieldName) {
    setDirtyFields((current) =>
      current[field] ? current : { ...current, [field]: true }
    )
  }

  function getFieldError(field: CourseFieldName) {
    if ((didSubmit || touchedFields[field]) && clientFieldErrors[field]) {
      return clientFieldErrors[field]
    }

    return dirtyFields[field] ? undefined : state.fieldErrors?.[field]
  }

  const hasClientErrors = Object.keys(clientFieldErrors).length > 0
  const shouldShowClientBanner = didSubmit && hasClientErrors
  const shouldShowServerBanner =
    Boolean(state.error) &&
    (!state.fieldErrors || Object.keys(dirtyFields).length === 0)
  const shouldShowSuccessBanner =
    Boolean(state.success) &&
    !hasClientErrors &&
    Object.keys(dirtyFields).length === 0

  return (
    <form
      action={formAction}
      className="max-w-2xl space-y-6"
      onSubmitCapture={(event) => {
        setDidSubmit(true)

        if (hasClientErrors) {
          event.preventDefault()
          return
        }

        setDirtyFields({})
      }}
    >
      {(shouldShowClientBanner || shouldShowServerBanner) && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error ?? "Corrige los campos marcados."}
        </div>
      )}
      {shouldShowSuccessBanner && (
        <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700">
          {state.successMessage ?? "Curso actualizado exitosamente."}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Titulo *</Label>
        <Input
          id="title"
          name="title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            markDirty("title")
          }}
          onBlur={() => markTouched("title")}
          minLength={COURSE_TITLE_MIN_LENGTH}
          maxLength={COURSE_TITLE_MAX_LENGTH}
          required
          aria-invalid={Boolean(getFieldError("title"))}
        />
        <FieldErrorText message={getFieldError("title")} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="shortDescription">Descripcion corta</Label>
        <Input
          id="shortDescription"
          name="shortDescription"
          value={shortDescription}
          onChange={(event) => {
            setShortDescription(event.target.value)
            markDirty("shortDescription")
          }}
          onBlur={() => markTouched("shortDescription")}
          minLength={COURSE_SHORT_DESCRIPTION_MIN_LENGTH}
          maxLength={COURSE_SHORT_DESCRIPTION_MAX_LENGTH}
          placeholder="Resumen corto del curso"
          aria-invalid={Boolean(getFieldError("shortDescription"))}
        />
        <p className="text-xs text-muted-foreground">
          Si la usas, debe tener entre 20 y 200 caracteres.
        </p>
        <FieldErrorText message={getFieldError("shortDescription")} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripcion completa</Label>
        <Textarea
          id="description"
          name="description"
          rows={5}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value)
            markDirty("description")
          }}
          onBlur={() => markTouched("description")}
          maxLength={COURSE_DESCRIPTION_MAX_LENGTH}
          aria-invalid={Boolean(getFieldError("description"))}
        />
        <FieldErrorText message={getFieldError("description")} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">Categoria *</Label>
          <Select
            name="category"
            value={category}
            onValueChange={(value) => {
              setCategory(value)
              markDirty("category")
            }}
          >
            <SelectTrigger
              id="category"
              aria-invalid={Boolean(getFieldError("category"))}
            >
              <SelectValue placeholder="Seleccionar categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="baile">Baile</SelectItem>
              <SelectItem value="tatuaje">Tatuaje</SelectItem>
            </SelectContent>
          </Select>
          <FieldErrorText message={getFieldError("category")} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="instructorId">Instructor *</Label>
          <Select
            name="instructorId"
            value={instructorId}
            onValueChange={(value) => {
              setInstructorId(value)
              markDirty("instructorId")
            }}
          >
            <SelectTrigger
              id="instructorId"
              aria-invalid={Boolean(getFieldError("instructorId"))}
            >
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
          <FieldErrorText message={getFieldError("instructorId")} />
        </div>
      </div>

      {isEditing && (
        <div className="space-y-2">
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-sm font-semibold">Destacados actuales del home</p>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              {[1, 2, 3, 4].map((position) => {
                const assignment = homeFeaturedAssignments.find(
                  (item) => item.position === position
                )
                const label = position === 1 ? "Hero (1)" : `Destacado ${position}`

                return (
                  <div
                    key={position}
                    className="flex items-center justify-between gap-4 rounded-lg border bg-background/60 px-3 py-2"
                  >
                    <span className="font-medium text-foreground">{label}</span>
                    <span>
                      {assignment ? assignment.title : "Disponible"}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <Label htmlFor="homeFeaturedPosition">Destacado en home</Label>
          <input
            type="hidden"
            name="replaceHomeFeatured"
            value={replaceHomeFeatured ? "true" : "false"}
          />
          <Select
            name="homeFeaturedPosition"
            value={homeFeaturedPosition}
            onValueChange={(value) => {
              setHomeFeaturedPosition(value)
              setReplaceHomeFeatured(false)
              markDirty("homeFeaturedPosition")
            }}
            disabled={!isPublishedChecked}
          >
            <SelectTrigger
              id="homeFeaturedPosition"
              aria-invalid={Boolean(getFieldError("homeFeaturedPosition"))}
            >
              <SelectValue placeholder="Seleccionar posicion" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No destacar</SelectItem>
              <SelectItem value="1">Hero (1)</SelectItem>
              <SelectItem value="2">Destacado 2</SelectItem>
              <SelectItem value="3">Destacado 3</SelectItem>
              <SelectItem value="4">Destacado 4</SelectItem>
            </SelectContent>
          </Select>
          {homeFeaturedPosition !== "none" && !selectedOccupiedByAnotherCourse && (
            <p className="text-xs text-emerald-600">
              {selectedAssignment?.id === course?.id
                ? `Este curso ya ocupa ${selectedPositionLabel}.`
                : `${selectedPositionLabel} esta disponible.`}
            </p>
          )}
          {selectedOccupiedByAnotherCourse && (
            <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm text-amber-950 dark:text-amber-100">
                {selectedPositionLabel} esta ocupado por{" "}
                <span className="font-semibold">{selectedAssignment?.title}</span>.
              </p>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="replaceHomeFeatured"
                  checked={replaceHomeFeatured}
                  onCheckedChange={(checked) => {
                    setReplaceHomeFeatured(Boolean(checked))
                    markDirty("homeFeaturedPosition")
                  }}
                />
                <Label
                  htmlFor="replaceHomeFeatured"
                  className="text-sm font-medium"
                >
                  Reemplazar este destacado al guardar
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Si confirmas, el curso actual tomara {selectedPositionLabel} y{" "}
                {selectedAssignment?.title} quedara sin destacar.
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Hero (1) ocupa la tarjeta principal del home. Las posiciones 2, 3
            y 4 llenan la grilla de destacados.
          </p>
          {!isPublishedChecked && (
            <p className="text-xs text-muted-foreground">
              Publica el curso primero para poder destacarlo en home.
            </p>
          )}
          <FieldErrorText message={getFieldError("homeFeaturedPosition")} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="price">Precio (COP pesos)</Label>
          <CopCurrencyInput
            id="price"
            name="price"
            value={priceValue}
            onValueChange={(value) => {
              setPriceValue(value)
              markDirty("price")
            }}
            onBlur={() => markTouched("price")}
            placeholder="$20.000"
            disabled={isFreeChecked}
            aria-invalid={Boolean(getFieldError("price"))}
          />
          <p className="text-xs text-muted-foreground">
            Ingresa un valor entero en COP. Ejemplo: $20.000
          </p>
          <FieldErrorText message={getFieldError("price")} />
        </div>

        <div className="flex items-end gap-3 pb-1">
          <div className="flex items-center gap-2">
            <Switch
              id="isFree"
              name="isFree"
              checked={isFreeChecked}
              onCheckedChange={(checked) => {
                setIsFreeChecked(checked)
                markDirty("price")
                markDirty("courseDiscountValue")
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
              onCheckedChange={(checked) => {
                setCourseDiscountEnabled(checked)
                markDirty("courseDiscountValue")
              }}
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
              onValueChange={(value) => {
                const nextType = value === "fixed" ? "fixed" : "percentage"
                setCourseDiscountType(nextType)
                setCourseDiscountValue((current) => {
                  if (nextType === "percentage") {
                    const parsed = Number(current || 0)
                    return parsed >= 1 && parsed <= 100 ? current : "10"
                  }

                  return current
                })
                markDirty("courseDiscountValue")
              }}
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
            {courseDiscountType === "percentage" ? (
              <Input
                id="courseDiscountValue"
                name="courseDiscountValue"
                type="number"
                min={1}
                max={100}
                step={1}
                value={courseDiscountValue}
                onChange={(event) => {
                  setCourseDiscountValue(event.target.value)
                  markDirty("courseDiscountValue")
                }}
                onBlur={() => markTouched("courseDiscountValue")}
                disabled={!courseDiscountEnabled || isFreeChecked}
                aria-invalid={Boolean(getFieldError("courseDiscountValue"))}
              />
            ) : (
              <CopCurrencyInput
                id="courseDiscountValue"
                name="courseDiscountValue"
                value={courseDiscountValue}
                onValueChange={(value) => {
                  setCourseDiscountValue(value)
                  markDirty("courseDiscountValue")
                }}
                onBlur={() => markTouched("courseDiscountValue")}
                placeholder="$5.000"
                disabled={!courseDiscountEnabled || isFreeChecked}
                aria-invalid={Boolean(getFieldError("courseDiscountValue"))}
                maxPesos={Number(priceValue || 0) || COP_MAX_PESOS}
              />
            )}
            <p className="text-xs text-muted-foreground">
              {courseDiscountType === "percentage"
                ? "Entre 1 y 100."
                : "En pesos colombianos. Ejemplo: $5.000"}
            </p>
            <FieldErrorText message={getFieldError("courseDiscountValue")} />
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
        </div>
      </div>

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
          aria-invalid={Boolean(getFieldError("thumbnail"))}
          onChange={(event) => {
            setThumbnailFile(event.target.files?.[0] ?? null)
            markDirty("thumbnail")
          }}
          onBlur={() => markTouched("thumbnail")}
        />
        <p className="text-xs text-muted-foreground">
          JPG, PNG o WebP. Maximo 2 MB. Resolucion recomendada: 1280x720.
        </p>
        <FieldErrorText message={getFieldError("thumbnail")} />
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
            checked={isPublishedChecked}
            onCheckedChange={(checked) => {
              setIsPublishedChecked(checked)
              if (!checked) {
                setHomeFeaturedPosition("none")
                setReplaceHomeFeatured(false)
                markDirty("homeFeaturedPosition")
              }
            }}
          />
          <Label htmlFor="isPublished" className="font-medium">
            Publicado
          </Label>
          <span className="text-sm text-muted-foreground">
            {isPublishedChecked
              ? "El curso es visible en el catalogo."
              : "El curso esta oculto del catalogo y sale de los destacados del home."}
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
