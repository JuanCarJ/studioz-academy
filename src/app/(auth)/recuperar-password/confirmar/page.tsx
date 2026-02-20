"use client"

import { useActionState } from "react"

import { updatePassword } from "@/actions/auth"
import type { AuthActionState } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCsrfToken } from "@/hooks/use-csrf-token"

export default function ConfirmPasswordPage() {
  const [state, formAction, isPending] = useActionState<AuthActionState, FormData>(
    updatePassword,
    {}
  )
  const { csrfToken, isLoading: isCsrfLoading, error: csrfError } = useCsrfToken()

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="mb-2 font-heading text-xl font-semibold">
          Nueva contrasena
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Ingresa tu nueva contrasena. Debe tener al menos 8 caracteres.
        </p>

        {csrfError && (
          <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {csrfError}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          {state.error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </div>
          )}
          <input type="hidden" name="csrfToken" value={csrfToken} />

          <div className="space-y-2">
            <Label htmlFor="password">Nueva contrasena</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Minimo 8 caracteres"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar contrasena</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="Repite tu contrasena"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isPending || isCsrfLoading || !csrfToken}
          >
            {isPending ? "Actualizando..." : "Actualizar contrasena"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
