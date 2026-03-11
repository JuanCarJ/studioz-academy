"use client"

import { ChangeEvent, useActionState, useEffect, useState } from "react"

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
import { Textarea } from "@/components/ui/textarea"
import {
  INSTRUCTOR_BIO_MAX_LENGTH,
  INSTRUCTOR_FULL_NAME_MAX_LENGTH,
  INSTRUCTOR_FULL_NAME_MIN_LENGTH,
  INSTRUCTOR_SPECIALTIES_MAX_ITEMS,
  INSTRUCTOR_SPECIALTY_MAX_LENGTH,
  INSTRUCTOR_SPECIALTY_MIN_LENGTH,
  INSTRUCTOR_YEARS_EXPERIENCE_MAX,
  getLengthError,
  parseSpecialtiesInput,
  parseWholeNumberInput,
  validateImageFile,
} from "@/lib/admin-form-utils"

import type { Instructor } from "@/types"

interface InstructorFormProps {
  instructor?: Instructor
  onSuccess?: () => void
}

type InstructorFieldName = keyof NonNullable<InstructorActionState["fieldErrors"]>
type InstructorFieldErrors = NonNullable<InstructorActionState["fieldErrors"]>

const MAX_AVATAR_SIZE = 2 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"]

function getClientInstructorFieldErrors(input: {
  fullName: string
  bio: string
  specialties: string
  yearsExperience: string
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

  const parsedSpecialties = parseSpecialtiesInput(input.specialties)
  if (parsedSpecialties.error) {
    fieldErrors.specialties = parsedSpecialties.error
  }

  const parsedYearsExperience = parseWholeNumberInput(input.yearsExperience, {
    label: "Los anos de experiencia",
    min: 0,
    max: INSTRUCTOR_YEARS_EXPERIENCE_MAX,
  })
  if (parsedYearsExperience.error) {
    fieldErrors.yearsExperience = parsedYearsExperience.error
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

function FieldErrorText({ message }: { message?: string }) {
  if (!message) return null

  return <p className="text-sm text-destructive">{message}</p>
}

export function InstructorForm({ instructor, onSuccess }: InstructorFormProps) {
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

  const [fullName, setFullName] = useState(instructor?.full_name ?? "")
  const [bio, setBio] = useState(instructor?.bio ?? "")
  const [specialties, setSpecialties] = useState(
    instructor?.specialties?.join(", ") ?? ""
  )
  const [yearsExperience, setYearsExperience] = useState(
    instructor?.years_experience?.toString() ?? ""
  )
  const [avatarFile, setAvatarFile] = useState<File | null>(null)

  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const clientFieldErrors = getClientInstructorFieldErrors({
    fullName,
    bio,
    specialties,
    yearsExperience,
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

  const avatarSrc = previewUrl ?? instructor?.avatar_url ?? undefined
  const hasClientErrors = Object.keys(clientFieldErrors).length > 0
  const shouldShowClientBanner = didSubmit && hasClientErrors
  const shouldShowServerBanner =
    Boolean(state.error) &&
    (!state.fieldErrors || Object.keys(dirtyFields).length === 0)

  return (
    <form
      action={formAction}
      className="space-y-4"
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

      <div className="space-y-2">
        <Label htmlFor="specialties">Especialidades (separadas por coma)</Label>
        <Input
          id="specialties"
          name="specialties"
          placeholder="Salsa, Bachata, Reggaeton"
          value={specialties}
          onChange={(event) => {
            setSpecialties(event.target.value)
            markDirty("specialties")
          }}
          onBlur={() => markTouched("specialties")}
          aria-invalid={Boolean(getFieldError("specialties"))}
        />
        <p className="text-xs text-muted-foreground">
          Maximo {INSTRUCTOR_SPECIALTIES_MAX_ITEMS} especialidades. Cada una debe
          tener entre {INSTRUCTOR_SPECIALTY_MIN_LENGTH} y{" "}
          {INSTRUCTOR_SPECIALTY_MAX_LENGTH} caracteres.
        </p>
        <FieldErrorText message={getFieldError("specialties")} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="yearsExperience">Anos de experiencia</Label>
        <Input
          id="yearsExperience"
          name="yearsExperience"
          type="number"
          min={0}
          max={INSTRUCTOR_YEARS_EXPERIENCE_MAX}
          step={1}
          value={yearsExperience}
          onChange={(event) => {
            setYearsExperience(event.target.value)
            markDirty("yearsExperience")
          }}
          onBlur={() => markTouched("yearsExperience")}
          aria-invalid={Boolean(getFieldError("yearsExperience"))}
        />
        <FieldErrorText message={getFieldError("yearsExperience")} />
      </div>

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
