"use client"

import { useActionState } from "react"
import Link from "next/link"

import { resetPassword } from "@/actions/auth"
import type { AuthActionState } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCsrfToken } from "@/hooks/use-csrf-token"

export default function RecoverPasswordPage() {
  const [state, formAction, isPending] = useActionState<AuthActionState, FormData>(
    resetPassword,
    {}
  )
  const { csrfToken, isLoading: isCsrfLoading, error: csrfError } = useCsrfToken()

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="mb-2 font-heading text-xl font-semibold">
          Recuperar contrasena
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Ingresa tu email y te enviaremos un enlace para restablecer tu
          contrasena.
        </p>

        {csrfError && (
          <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {csrfError}
          </div>
        )}

        {state.success ? (
          <div className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
            Si existe una cuenta con ese email, recibiras un enlace para
            restablecer tu contrasena. Revisa tu bandeja de entrada.
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            {state.error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </div>
            )}
            <input type="hidden" name="csrfToken" value={csrfToken} />

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="tu@email.com"
                required
                autoComplete="email"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isPending || isCsrfLoading || !csrfToken}
            >
              {isPending ? "Enviando..." : "Enviar enlace"}
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter className="justify-center">
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-primary"
        >
          Volver al inicio de sesion
        </Link>
      </CardFooter>
    </Card>
  )
}
