"use client"

import { useEffect, useState } from "react"

interface CsrfPayload {
  csrfToken?: string
}

const CSRF_INIT_ERROR =
  "No se pudo inicializar la seguridad del formulario. Recarga la pagina e intenta de nuevo."

export function useCsrfToken() {
  const [csrfToken, setCsrfToken] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function initCsrfToken() {
      try {
        const response = await fetch("/api/csrf", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        })

        if (!response.ok) {
          throw new Error("Unable to initialize CSRF token")
        }

        const payload = (await response.json()) as CsrfPayload
        if (typeof payload.csrfToken !== "string" || payload.csrfToken.length === 0) {
          throw new Error("Missing CSRF token")
        }

        if (!cancelled) {
          setCsrfToken(payload.csrfToken)
        }
      } catch {
        if (!cancelled) {
          setError(CSRF_INIT_ERROR)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void initCsrfToken()

    return () => {
      cancelled = true
    }
  }, [])

  return { csrfToken, isLoading, error }
}
