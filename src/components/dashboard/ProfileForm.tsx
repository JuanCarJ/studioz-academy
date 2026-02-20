"use client"

import { useActionState, useState, useTransition } from "react"

import { updateProfile, requestAccountDeletion } from "@/actions/profile"
import type { ProfileActionState } from "@/actions/profile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface ProfileFormProps {
  defaultValues: {
    fullName: string
    email: string
    phone: string
    emailNotifications: boolean
    avatarUrl?: string | null
  }
}

export function ProfileForm({ defaultValues }: ProfileFormProps) {
  const [state, formAction, isPending] = useActionState<
    ProfileActionState,
    FormData
  >(updateProfile, {})

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, startDeleteTransition] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function handleDeleteAccount() {
    setDeleteError(null)
    startDeleteTransition(async () => {
      const result = await requestAccountDeletion()
      if (result?.error) {
        setDeleteError(result.error)
        setShowDeleteConfirm(false)
      }
    })
  }

  return (
    <div className="space-y-10">
      <form action={formAction} className="space-y-6">
        {state.error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </div>
        )}
        {state.success && (
          <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700">
            Perfil actualizado exitosamente.
          </div>
        )}

        {/* H-07: Avatar upload */}
        <div className="space-y-2">
          <Label htmlFor="avatar">Foto de perfil</Label>
          <div className="flex items-center gap-4">
            {defaultValues.avatarUrl ? (
              <img
                src={defaultValues.avatarUrl}
                alt="Avatar actual"
                className="h-16 w-16 rounded-full border object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full border bg-muted text-xl font-bold text-muted-foreground">
                {defaultValues.fullName?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
            )}
            <Input
              id="avatar"
              name="avatar"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="max-w-xs"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            JPG, PNG o WebP. Maximo 2 MB.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            value={defaultValues.email}
            disabled
            className="bg-muted"
          />
          <p className="text-xs text-muted-foreground">
            El email no se puede cambiar.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fullName">Nombre completo *</Label>
          <Input
            id="fullName"
            name="fullName"
            defaultValue={defaultValues.fullName}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Telefono</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder="300 123 4567"
            defaultValue={defaultValues.phone}
          />
        </div>

        <div className="flex items-center gap-3 rounded-lg border p-4">
          <Switch
            id="emailNotifications"
            name="emailNotifications"
            defaultChecked={defaultValues.emailNotifications}
          />
          <div>
            <Label htmlFor="emailNotifications" className="font-medium">
              Notificaciones por email
            </Label>
            <p className="text-sm text-muted-foreground">
              Recibe actualizaciones sobre tus cursos y novedades.
            </p>
          </div>
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </form>

      {/* H-11: Danger zone — account deletion */}
      <div className="rounded-lg border border-destructive/30 p-6">
        <h3 className="text-lg font-semibold text-destructive">
          Zona peligrosa
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Al eliminar tu cuenta, tus datos personales seran anonimizados de
          forma permanente. Tu historial de compras se conservara de forma
          anonima por 5 anos conforme a la legislacion tributaria colombiana.
        </p>

        {deleteError && (
          <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {deleteError}
          </div>
        )}

        {!showDeleteConfirm ? (
          <Button
            variant="destructive"
            className="mt-4"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
          >
            Solicitar eliminacion de cuenta
          </Button>
        ) : (
          <div className="mt-4 space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium">
              Estas seguro? Esta accion no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
              >
                {isDeleting ? "Eliminando..." : "Si, eliminar mi cuenta"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
