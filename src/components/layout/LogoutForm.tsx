"use client"

import type { FormEvent, ReactNode } from "react"
import { useRef } from "react"

import { logout } from "@/actions/auth"
import { useCsrfToken } from "@/hooks/use-csrf-token"
import { flushActiveVideoProgress } from "@/lib/video-progress-client"

const LOGOUT_FLUSH_TIMEOUT_MS = 1_000

interface LogoutFormProps {
  className?: string
  buttonClassName?: string
  children: ReactNode
  formTestId?: string
  buttonTestId?: string
}

export function LogoutForm({
  className,
  buttonClassName,
  children,
  formTestId,
  buttonTestId,
}: LogoutFormProps) {
  const { csrfToken } = useCsrfToken()
  const allowNativeSubmitRef = useRef(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (allowNativeSubmitRef.current) {
      allowNativeSubmitRef.current = false
      return
    }

    const form = event.currentTarget

    event.preventDefault()

    if (!csrfToken) return

    await Promise.race([
      flushActiveVideoProgress(),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, LOGOUT_FLUSH_TIMEOUT_MS)
      }),
    ]).catch(() => undefined)

    allowNativeSubmitRef.current = true
    window.setTimeout(() => {
      form.requestSubmit()
    }, 0)
  }

  return (
    <form
      action={logout}
      className={className}
      data-testid={formTestId}
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <button
        type="submit"
        disabled={!csrfToken}
        className={buttonClassName}
        data-testid={buttonTestId}
      >
        {children}
      </button>
    </form>
  )
}
