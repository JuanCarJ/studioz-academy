"use client"

import { ChangeEvent, useActionState, useEffect, useState } from "react"

import {
  createInstructor,
  updateInstructor,
} from "@/actions/admin/instructors"
import type { InstructorActionState } from "@/actions/admin/instructors"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"

import type { Instructor } from "@/types"

interface InstructorFormProps {
  instructor?: Instructor
  onSuccess?: () => void
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

  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return file ? URL.createObjectURL(file) : null
    })
  }

  const avatarSrc = previewUrl ?? instructor?.avatar_url ?? undefined

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
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
            <AvatarImage src={avatarSrc} alt="Avatar del instructor" className="object-cover" />
            <AvatarFallback className="bg-muted text-xl font-bold text-muted-foreground">
              {instructor?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
          <Input
            id="avatar"
            name="avatar"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="max-w-xs"
            onChange={handleAvatarChange}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          JPG, PNG o WebP. Maximo 2 MB.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">Nombre completo *</Label>
        <Input
          id="fullName"
          name="fullName"
          defaultValue={instructor?.full_name ?? ""}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          name="bio"
          rows={3}
          defaultValue={instructor?.bio ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="specialties">Especialidades (separadas por coma)</Label>
        <Input
          id="specialties"
          name="specialties"
          placeholder="Salsa, Bachata, Reggaeton"
          defaultValue={instructor?.specialties?.join(", ") ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="yearsExperience">Anos de experiencia</Label>
        <Input
          id="yearsExperience"
          name="yearsExperience"
          type="number"
          min={0}
          defaultValue={instructor?.years_experience ?? ""}
        />
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
