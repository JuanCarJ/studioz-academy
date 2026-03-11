"use client"

import {
  ChangeEvent,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react"

import {
  createInstructor,
  updateInstructor,
  type InstructorActionState,
} from "@/actions/admin/instructors"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  INSTRUCTOR_BIO_MAX_LENGTH,
  INSTRUCTOR_FULL_NAME_MAX_LENGTH,
  INSTRUCTOR_FULL_NAME_MIN_LENGTH,
  INSTRUCTOR_SPECIALTIES_MAX_ITEMS,
  buildInstructorSpecialtyValue,
  getLengthError,
  getSpecialtyNameError,
  isInstructorSpecialtyCategory,
  normalizeSpecialtyKey,
  normalizeSpecialtyName,
  validateImageFile,
} from "@/lib/admin-form-utils"

import type {
  Instructor,
  InstructorSpecialtyCategory,
  InstructorSpecialtyOption,
} from "@/types"

interface InstructorFormProps {
  instructor?: Instructor
  specialtyOptions: InstructorSpecialtyOption[]
  onSuccess?: () => void
}

type InstructorFieldName = keyof NonNullable<InstructorActionState["fieldErrors"]>
type InstructorFieldErrors = NonNullable<InstructorActionState["fieldErrors"]>

const MAX_AVATAR_SIZE = 2 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"]
const CATEGORY_LABELS: Record<InstructorSpecialtyCategory, string> = {
  baile: "Baile",
  tatuaje: "Tatuaje",
}

function FieldErrorText({ message }: { message?: string }) {
  if (!message) return null

  return <p className="text-sm text-destructive">{message}</p>
}

function getSpecialtyValue(option: Pick<
  InstructorSpecialtyOption,
  "category" | "normalized_name"
>) {
  return buildInstructorSpecialtyValue(option.category, option.normalized_name)
}

function getClientInstructorFieldErrors(input: {
  fullName: string
  bio: string
  selectedSpecialties: string[]
  newSpecialtyName: string
  newSpecialtyCategory: string
  avatarFile: File | null
}) {
  const fieldErrors: InstructorFieldErrors = {}
  const fullName = input.fullName.trim().replace(/\s+/g, " ")
  const bio = input.bio.trim().replace(/\s+/g, " ")

  const fullNameError = getLengthError({
    value: fullName,
    label: "El nombre",
    required: true,
    min: INSTRUCTOR_FULL_NAME_MIN_LENGTH,
    max: INSTRUCTOR_FULL_NAME_MAX_LENGTH,
  })
  if (fullNameError) {
    fieldErrors.fullName = fullNameError
  }

  if (bio) {
    const bioError = getLengthError({
      value: bio,
      label: "La bio",
      max: INSTRUCTOR_BIO_MAX_LENGTH,
    })
    if (bioError) {
      fieldErrors.bio = bioError
    }
  }

  const selectedSpecialties = new Set(input.selectedSpecialties)
  const newSpecialtyName = normalizeSpecialtyName(input.newSpecialtyName)

  if (input.newSpecialtyName.trim()) {
    const specialtyNameError = getSpecialtyNameError(newSpecialtyName)
    if (specialtyNameError) {
      fieldErrors.newSpecialtyName = specialtyNameError
    }

    if (!isInstructorSpecialtyCategory(input.newSpecialtyCategory)) {
      fieldErrors.newSpecialtyCategory =
        "Selecciona la categoria de la nueva especialidad."
    } else {
      selectedSpecialties.add(
        buildInstructorSpecialtyValue(
          input.newSpecialtyCategory,
          normalizeSpecialtyKey(input.newSpecialtyName)
        )
      )
    }
  }

  if (selectedSpecialties.size > INSTRUCTOR_SPECIALTIES_MAX_ITEMS) {
    fieldErrors.specialties = `Puedes seleccionar hasta ${INSTRUCTOR_SPECIALTIES_MAX_ITEMS} especialidades.`
  }

  const avatarError = validateImageFile(input.avatarFile, {
    label: "La foto",
    allowedTypes: ALLOWED_AVATAR_TYPES,
    maxSizeBytes: MAX_AVATAR_SIZE,
  })
  if (avatarError) {
    fieldErrors.avatar = avatarError
  }

  return fieldErrors
}

export function InstructorForm({
  instructor,
  specialtyOptions,
  onSuccess,
}: InstructorFormProps) {
  const isEditing = !!instructor

  const boundAction = isEditing
    ? updateInstructor.bind(null, instructor.id)
    : createInstructor

  const [state, formAction, isPending] = useActionState<
    InstructorActionState,
    FormData
  >(
    async (prevState, formData) => {
      const result = await boundAction(prevState, formData)
      if (result.success) onSuccess?.()
      return result
    },
    {}
  )

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [didSubmit, setDidSubmit] = useState(false)
  const [touchedFields, setTouchedFields] = useState<
    Partial<Record<InstructorFieldName, boolean>>
  >({})
  const [dirtyFields, setDirtyFields] = useState<
    Partial<Record<InstructorFieldName, boolean>>
  >({})
  const [localSpecialtyOptions, setLocalSpecialtyOptions] =
    useState<InstructorSpecialtyOption[]>(specialtyOptions)

  const [fullName, setFullName] = useState(instructor?.full_name ?? "")
  const [bio, setBio] = useState(instructor?.bio ?? "")
  const [selectedSpecialties, setSelectedSpecialties] = useState(() => {
    const selectedNames = new Set(instructor?.specialties ?? [])

    return specialtyOptions
      .filter((option) => selectedNames.has(option.name))
      .map((option) => getSpecialtyValue(option))
  })
  const [newSpecialtyName, setNewSpecialtyName] = useState("")
  const [newSpecialtyCategory, setNewSpecialtyCategory] = useState("")
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const pendingCreatedSpecialty = useRef<InstructorSpecialtyOption | null>(null)

  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => {
    if (!state.success || !pendingCreatedSpecialty.current) return

    const pendingOption = pendingCreatedSpecialty.current
    pendingCreatedSpecialty.current = null

    setLocalSpecialtyOptions((current) => {
      const alreadyExists = current.some(
        (option) =>
          option.category === pendingOption.category &&
          option.normalized_name === pendingOption.normalized_name
      )
      if (alreadyExists) {
        return current
      }

      return [...current, pendingOption].sort((left, right) => {
        if (left.category !== right.category) {
          return left.category.localeCompare(right.category)
        }
        return left.name.localeCompare(right.name, "es-CO")
      })
    })

    const specialtyValue = getSpecialtyValue(pendingOption)
    setSelectedSpecialties((current) =>
      current.includes(specialtyValue) ? current : [...current, specialtyValue]
    )
    setNewSpecialtyName("")
    setNewSpecialtyCategory("")
  }, [state.success])

  const clientFieldErrors = getClientInstructorFieldErrors({
    fullName,
    bio,
    selectedSpecialties,
    newSpecialtyName,
    newSpecialtyCategory,
    avatarFile,
  })

  function markTouched(field: InstructorFieldName) {
    setTouchedFields((current) =>
      current[field] ? current : { ...current, [field]: true }
    )
  }

  function markDirty(field: InstructorFieldName) {
    setDirtyFields((current) =>
      current[field] ? current : { ...current, [field]: true }
    )
  }

  function getFieldError(field: InstructorFieldName) {
    if ((didSubmit || touchedFields[field]) && clientFieldErrors[field]) {
      return clientFieldErrors[field]
    }

    return dirtyFields[field] ? undefined : state.fieldErrors?.[field]
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setAvatarFile(file)
    markDirty("avatar")
    markTouched("avatar")
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return file ? URL.createObjectURL(file) : null
    })
  }

  function toggleSpecialty(value: string, checked: boolean) {
    setSelectedSpecialties((current) => {
      if (checked) {
        return current.includes(value) ? current : [...current, value]
      }

      return current.filter((item) => item !== value)
    })
    markDirty("specialties")
    markTouched("specialties")
  }

  function handleNewSpecialtyBlur() {
    const normalizedName = normalizeSpecialtyName(newSpecialtyName)
    setNewSpecialtyName(normalizedName)
    markTouched("newSpecialtyName")
    markTouched("newSpecialtyCategory")

    if (!normalizedName || !isInstructorSpecialtyCategory(newSpecialtyCategory)) {
      return
    }

    const existingOption = localSpecialtyOptions.find(
      (option) =>
        option.category === newSpecialtyCategory &&
        option.normalized_name === normalizeSpecialtyKey(normalizedName)
    )

    if (!existingOption) return

    const specialtyValue = getSpecialtyValue(existingOption)
    setSelectedSpecialties((current) =>
      current.includes(specialtyValue) ? current : [...current, specialtyValue]
    )
    markDirty("specialties")
    markTouched("specialties")
    setNewSpecialtyName("")
    setNewSpecialtyCategory("")
  }

  const groupedOptions = {
    baile: localSpecialtyOptions.filter((option) => option.category === "baile"),
    tatuaje: localSpecialtyOptions.filter(
      (option) => option.category === "tatuaje"
    ),
  }

  const avatarSrc = previewUrl ?? instructor?.avatar_url ?? undefined
  const hasClientErrors = Object.keys(clientFieldErrors).length > 0
  const shouldShowClientBanner = didSubmit && hasClientErrors
  const shouldShowServerBanner =
    Boolean(state.error) &&
    (!state.fieldErrors || Object.keys(dirtyFields).length === 0)

  return (
    <form
      action={formAction}
      className="space-y-6"
      onSubmitCapture={(event) => {
        setDidSubmit(true)
        pendingCreatedSpecialty.current = null

        if (hasClientErrors) {
          event.preventDefault()
          return
        }

        if (
          newSpecialtyName.trim() &&
          isInstructorSpecialtyCategory(newSpecialtyCategory)
        ) {
          const normalizedName = normalizeSpecialtyName(newSpecialtyName)
          const normalizedKey = normalizeSpecialtyKey(normalizedName)
          const alreadyExists = localSpecialtyOptions.some(
            (option) =>
              option.category === newSpecialtyCategory &&
              option.normalized_name === normalizedKey
          )

          if (!alreadyExists) {
            pendingCreatedSpecialty.current = {
              id: `draft:${buildInstructorSpecialtyValue(
                newSpecialtyCategory,
                normalizedKey
              )}`,
              name: normalizedName,
              normalized_name: normalizedKey,
              category: newSpecialtyCategory,
              created_at: "",
              updated_at: "",
            }
          }
        }

        setDirtyFields({})
      }}
    >
      {(shouldShowClientBanner || shouldShowServerBanner) && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error ?? "Corrige los campos marcados."}
        </div>
      )}
      {state.success && (
        <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700">
          {isEditing ? "Instructor actualizado." : "Instructor creado."}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="avatar">Foto</Label>
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border">
            <AvatarImage
              src={avatarSrc}
              alt="Avatar del instructor"
              className="object-cover"
            />
            <AvatarFallback className="bg-muted text-xl font-bold text-muted-foreground">
              {fullName.trim().charAt(0).toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
          <Input
            id="avatar"
            name="avatar"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="max-w-xs"
            onChange={handleAvatarChange}
            aria-invalid={Boolean(getFieldError("avatar"))}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          JPG, PNG o WebP. Maximo 2 MB.
        </p>
        <FieldErrorText message={getFieldError("avatar")} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">Nombre completo *</Label>
        <Input
          id="fullName"
          name="fullName"
          value={fullName}
          onChange={(event) => {
            setFullName(event.target.value)
            markDirty("fullName")
          }}
          onBlur={() => markTouched("fullName")}
          minLength={INSTRUCTOR_FULL_NAME_MIN_LENGTH}
          maxLength={INSTRUCTOR_FULL_NAME_MAX_LENGTH}
          required
          aria-invalid={Boolean(getFieldError("fullName"))}
        />
        <FieldErrorText message={getFieldError("fullName")} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          name="bio"
          rows={3}
          value={bio}
          onChange={(event) => {
            setBio(event.target.value)
            markDirty("bio")
          }}
          onBlur={() => markTouched("bio")}
          maxLength={INSTRUCTOR_BIO_MAX_LENGTH}
          aria-invalid={Boolean(getFieldError("bio"))}
        />
        <FieldErrorText message={getFieldError("bio")} />
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Especialidades</Label>
          <p className="text-xs text-muted-foreground">
            Selecciona las disponibles y, si hace falta, crea una nueva con la
            categoria correcta. Maximo {INSTRUCTOR_SPECIALTIES_MAX_ITEMS}.
          </p>
        </div>

        {(Object.keys(groupedOptions) as InstructorSpecialtyCategory[]).map(
          (category) => (
            <div key={category} className="rounded-lg border p-4">
              <p className="text-sm font-medium">{CATEGORY_LABELS[category]}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {groupedOptions[category].length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No hay especialidades registradas en esta categoria.
                  </p>
                )}
                {groupedOptions[category].map((option) => {
                  const specialtyValue = getSpecialtyValue(option)

                  return (
                    <label
                      key={specialtyValue}
                      className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={selectedSpecialties.includes(specialtyValue)}
                        onCheckedChange={(checked) =>
                          toggleSpecialty(specialtyValue, checked === true)
                        }
                        aria-label={option.name}
                      />
                      <span>{option.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        )}

        {selectedSpecialties.map((value) => (
          <input key={value} type="hidden" name="specialties" value={value} />
        ))}

        <div className="rounded-lg border border-dashed p-4">
          <p className="text-sm font-medium">Nueva especialidad</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="newSpecialtyCategory">Categoria</Label>
              <Select
                value={newSpecialtyCategory}
                onValueChange={(value) => {
                  setNewSpecialtyCategory(value)
                  markDirty("newSpecialtyCategory")
                }}
              >
                <SelectTrigger id="newSpecialtyCategory" className="w-full">
                  <SelectValue placeholder="Selecciona una categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baile">Baile</SelectItem>
                  <SelectItem value="tatuaje">Tatuaje</SelectItem>
                </SelectContent>
              </Select>
              <input
                type="hidden"
                name="newSpecialtyCategory"
                value={newSpecialtyCategory}
              />
              <FieldErrorText message={getFieldError("newSpecialtyCategory")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newSpecialtyName">Nombre</Label>
              <Input
                id="newSpecialtyName"
                name="newSpecialtyName"
                placeholder="Ej. Salsa Caleña"
                value={newSpecialtyName}
                onChange={(event) => {
                  setNewSpecialtyName(event.target.value)
                  markDirty("newSpecialtyName")
                }}
                onBlur={handleNewSpecialtyBlur}
                aria-invalid={Boolean(getFieldError("newSpecialtyName"))}
              />
              <p className="text-xs text-muted-foreground">
                Se guardara con la primera letra en mayuscula de cada palabra.
              </p>
              <FieldErrorText message={getFieldError("newSpecialtyName")} />
            </div>
          </div>
        </div>

        <FieldErrorText message={getFieldError("specialties")} />
      </div>

      {selectedSpecialties.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedSpecialties.map((value) => {
            const option = localSpecialtyOptions.find(
              (item) => getSpecialtyValue(item) === value
            )

            if (!option) return null

            return (
              <span
                key={value}
                className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                {option.name}
              </span>
            )
          })}
        </div>
      )}

      {isEditing && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="isActive"
            name="isActive"
            defaultChecked={instructor.is_active}
          />
          <Label htmlFor="isActive">Activo</Label>
        </div>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending
          ? isEditing
            ? "Guardando..."
            : "Creando..."
          : isEditing
            ? "Guardar cambios"
            : "Crear instructor"}
      </Button>
    </form>
  )
}
