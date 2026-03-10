"use client"

import { useActionState, useEffect, useRef } from "react"

import {
  createGalleryImage,
  updateGalleryImage,
} from "@/actions/admin/editorial"
import type { EditorialFormState } from "@/actions/admin/editorial"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import type { GalleryItem } from "@/types"

const selectClassName =
  "border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"

interface GalleryAdminFormProps {
  item?: GalleryItem
  testId?: string
}

export function GalleryAdminForm({ item, testId }: GalleryAdminFormProps) {
  const isEditing = !!item
  const formRef = useRef<HTMLFormElement>(null)

  const boundAction = isEditing
    ? updateGalleryImage.bind(null, item.id)
    : createGalleryImage

  const [state, formAction, isPending] = useActionState<
    EditorialFormState,
    FormData
  >(boundAction, {})

  useEffect(() => {
    if (!state.success || isEditing) return
    formRef.current?.reset()
  }, [isEditing, state.success])

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4"
      data-testid={testId}
    >
      {state.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {state.success && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          {isEditing ? "Imagen actualizada." : "Imagen creada y publicada."}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={isEditing ? `caption-${item.id}` : "caption"}>
            Nombre
          </Label>
          <Input
            id={isEditing ? `caption-${item.id}` : "caption"}
            name="caption"
            defaultValue={item?.caption ?? ""}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={isEditing ? `category-${item.id}` : "category"}>
            Categoria
          </Label>
          <select
            id={isEditing ? `category-${item.id}` : "category"}
            name="category"
            className={selectClassName}
            defaultValue={item?.category ?? "baile"}
            required
          >
            <option value="baile">Baile</option>
            <option value="tatuaje">Tatuaje</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={isEditing ? `image-${item.id}` : "image"}>
          {isEditing ? "Reemplazar imagen" : "Archivo imagen"}
        </Label>
        <Input
          id={isEditing ? `image-${item.id}` : "image"}
          name="image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required={!isEditing}
        />
        <p className="text-xs text-muted-foreground">
          JPG, PNG o WebP. Maximo 5 MB.
        </p>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending
          ? isEditing
            ? "Guardando..."
            : "Creando..."
          : isEditing
            ? "Guardar cambios"
            : "Crear imagen"}
      </Button>
    </form>
  )
}
