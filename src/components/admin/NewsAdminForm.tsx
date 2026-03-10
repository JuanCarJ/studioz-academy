"use client"

import { startTransition, useActionState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

import { createNews, updateNews } from "@/actions/admin/editorial"
import type { EditorialFormState } from "@/actions/admin/editorial"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import type { Post } from "@/types"

interface NewsAdminFormProps {
  post?: Post
  testId?: string
}

export function NewsAdminForm({ post, testId }: NewsAdminFormProps) {
  const isEditing = !!post
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()

  const boundAction = isEditing ? updateNews.bind(null, post.id) : createNews

  const [state, formAction, isPending] = useActionState<
    EditorialFormState,
    FormData
  >(boundAction, {})

  useEffect(() => {
    if (!state.success) return
    if (!isEditing) {
      formRef.current?.reset()
    }

    startTransition(() => {
      router.refresh()
    })
  }, [isEditing, router, state.success])

  const existingImages = post?.images ?? []

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
          {isEditing ? "Noticia actualizada y publicada." : "Noticia creada y publicada."}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={isEditing ? `title-${post.id}` : "title"}>Titulo</Label>
          <Input
            id={isEditing ? `title-${post.id}` : "title"}
            name="title"
            defaultValue={post?.title ?? ""}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={isEditing ? `excerpt-${post.id}` : "excerpt"}>
            Extracto
          </Label>
          <Input
            id={isEditing ? `excerpt-${post.id}` : "excerpt"}
            name="excerpt"
            defaultValue={post?.excerpt ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            Si lo dejas vacio, se genera automaticamente desde el contenido.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={isEditing ? `content-${post.id}` : "content"}>
          Contenido
        </Label>
        <Textarea
          id={isEditing ? `content-${post.id}` : "content"}
          name="content"
          defaultValue={post?.content ?? ""}
          className="min-h-40"
          required
        />
      </div>

      {isEditing && existingImages.length > 0 && (
        <div className="space-y-3">
          <Label>Imagenes publicadas</Label>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {existingImages.map((image, index) => (
              <label
                key={image.id}
                className="space-y-2 rounded-2xl border p-3 text-sm"
              >
                <div
                  className="aspect-[4/3] rounded-xl border bg-cover bg-center"
                  style={{ backgroundImage: `url("${image.image_url}")` }}
                />
                <div className="flex items-center justify-between gap-3">
                  <span>Imagen {index + 1}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      name="removeImageIds"
                      value={image.id}
                      className="h-4 w-4"
                    />
                    Eliminar
                  </span>
                </div>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Puedes retirar imagenes, pero la noticia debe conservar al menos una.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={isEditing ? `images-${post.id}` : "images"}>
          {isEditing ? "Agregar mas imagenes" : "Imagenes de la noticia"}
        </Label>
        <Input
          id={isEditing ? `images-${post.id}` : "images"}
          name="images"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          required={!isEditing}
        />
        <p className="text-xs text-muted-foreground">
          Sube una o varias imagenes. La primera quedara como portada publica.
        </p>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending
          ? isEditing
            ? "Guardando..."
            : "Creando..."
          : isEditing
            ? "Guardar cambios"
            : "Crear noticia"}
      </Button>
    </form>
  )
}
