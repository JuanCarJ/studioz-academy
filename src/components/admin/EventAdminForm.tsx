"use client"

import { useActionState, useEffect, useRef, useState } from "react"

import { createEvent, updateEvent } from "@/actions/admin/editorial"
import type { EditorialFormState } from "@/actions/admin/editorial"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import type { Event } from "@/types"

declare global {
  interface Window {
    __googlePlacesLoader?: Promise<void>
    google?: {
      maps?: {
        places?: {
          Autocomplete: new (
            input: HTMLInputElement,
            options?: Record<string, unknown>
          ) => {
            addListener: (eventName: string, listener: () => void) => { remove: () => void }
            getPlace: () => { formatted_address?: string }
          }
        }
      }
    }
  }
}

function toDatetimeLocal(value: string) {
  return new Date(value).toISOString().slice(0, 16)
}

function loadGooglePlacesScript(apiKey: string) {
  if (window.google?.maps?.places) {
    return Promise.resolve()
  }

  if (!window.__googlePlacesLoader) {
    window.__googlePlacesLoader = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[data-google-places="true"]'
      )

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true })
        existingScript.addEventListener(
          "error",
          () => reject(new Error("No se pudo cargar Google Places.")),
          { once: true }
        )
        return
      }

      const script = document.createElement("script")
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
      script.async = true
      script.defer = true
      script.dataset.googlePlaces = "true"
      script.onload = () => resolve()
      script.onerror = () => reject(new Error("No se pudo cargar Google Places."))
      document.head.appendChild(script)
    })
  }

  return window.__googlePlacesLoader
}

interface EventAdminFormProps {
  event?: Event
  testId?: string
}

export function EventAdminForm({ event, testId }: EventAdminFormProps) {
  const isEditing = !!event
  const formRef = useRef<HTMLFormElement>(null)
  const locationInputRef = useRef<HTMLInputElement>(null)
  const [placesStatus, setPlacesStatus] = useState<"idle" | "ready" | "fallback">(
    "idle"
  )
  const hasPlacesApiKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)

  const boundAction = isEditing ? updateEvent.bind(null, event.id) : createEvent

  const [state, formAction, isPending] = useActionState<
    EditorialFormState,
    FormData
  >(boundAction, {})

  useEffect(() => {
    if (!state.success || isEditing) return
    formRef.current?.reset()
  }, [isEditing, state.success])

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""
    const input = locationInputRef.current

    if (!input || !apiKey) return

    let listener: { remove: () => void } | null = null
    let isMounted = true

    loadGooglePlacesScript(apiKey)
      .then(() => {
        if (!isMounted || !window.google?.maps?.places) return
        const autocomplete = new window.google.maps.places.Autocomplete(input, {
          fields: ["formatted_address"],
        })
        listener = autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace()
          const nextValue = place.formatted_address?.trim() || input.value.trim()
          input.value = nextValue
        })
        setPlacesStatus("ready")
      })
      .catch(() => {
        if (!isMounted) return
        setPlacesStatus("fallback")
      })

    return () => {
      isMounted = false
      listener?.remove()
    }
  }, [])

  const existingImages = event?.images ?? []

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
          {isEditing ? "Evento actualizado y publicado." : "Evento creado y publicado."}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={isEditing ? `title-${event.id}` : "title"}>Titulo</Label>
          <Input
            id={isEditing ? `title-${event.id}` : "title"}
            name="title"
            defaultValue={event?.title ?? ""}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={isEditing ? `eventDate-${event.id}` : "eventDate"}>
            Fecha y hora
          </Label>
          <Input
            id={isEditing ? `eventDate-${event.id}` : "eventDate"}
            name="eventDate"
            type="datetime-local"
            defaultValue={event ? toDatetimeLocal(event.event_date) : ""}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={isEditing ? `location-${event.id}` : "location"}>
          Direccion
        </Label>
        <Input
          ref={locationInputRef}
          id={isEditing ? `location-${event.id}` : "location"}
          name="location"
          defaultValue={event?.location ?? ""}
          placeholder="Empieza a escribir la direccion del evento"
          required
        />
        <p className="text-xs text-muted-foreground">
          {placesStatus === "ready"
            ? "Google Places activo. Puedes escribir o elegir una sugerencia."
            : hasPlacesApiKey
              ? "Si Google Places no carga, puedes escribir la direccion manualmente."
              : "Google Places no esta configurado. Puedes escribir la direccion manualmente."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={isEditing ? `description-${event.id}` : "description"}>
          Descripcion
        </Label>
        <Textarea
          id={isEditing ? `description-${event.id}` : "description"}
          name="description"
          defaultValue={event?.description ?? ""}
          className="min-h-32"
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
            Puedes marcar imagenes para retirar, pero el evento debe conservar al
            menos una.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={isEditing ? `images-${event.id}` : "images"}>
          {isEditing ? "Agregar mas imagenes" : "Imagenes del evento"}
        </Label>
        <Input
          id={isEditing ? `images-${event.id}` : "images"}
          name="images"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          required={!isEditing}
        />
        <p className="text-xs text-muted-foreground">
          Sube una o varias imagenes. La primera quedara como portada del evento.
        </p>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending
          ? isEditing
            ? "Guardando..."
            : "Creando..."
          : isEditing
            ? "Guardar cambios"
            : "Crear evento"}
      </Button>
    </form>
  )
}
