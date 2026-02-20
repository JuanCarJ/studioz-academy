"use client"

import { useActionState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

import { login, loginWithGoogle } from "@/actions/auth"
import type { AuthActionState } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useCsrfToken } from "@/hooks/use-csrf-token"

function LoginForm() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get("redirect")
  const message = searchParams.get("message")

  const [state, formAction, isPending] = useActionState<AuthActionState, FormData>(
    login,
    {}
  )
  const { csrfToken, isLoading: isCsrfLoading, error: csrfError } = useCsrfToken()

  return (
    <Card>
      <CardContent className="pt-6">
        {message === "password-updated" && (
          <div className="mb-4 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
            Contrasena actualizada. Inicia sesion con tu nueva contrasena.
          </div>
        )}

        {csrfError && (
          <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {csrfError}
          </div>
        )}

        <form action={loginWithGoogle}>
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <Button
            variant="outline"
            className="w-full"
            type="submit"
            disabled={isCsrfLoading || !csrfToken}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Iniciar sesion con Google
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">o con email</span>
          <Separator className="flex-1" />
        </div>

        <form action={formAction} className="space-y-4">
          {state.error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </div>
          )}

          {redirectTo && (
            <input type="hidden" name="redirect" value={redirectTo} />
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Contrasena</Label>
              <Link
                href="/recuperar-password"
                className="text-xs text-muted-foreground hover:text-primary"
              >
                Olvidaste tu contrasena?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isPending || isCsrfLoading || !csrfToken}
          >
            {isPending ? "Ingresando..." : "Iniciar sesion"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          No tienes cuenta?{" "}
          <Link href="/registro" className="text-primary hover:underline">
            Registrate
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
