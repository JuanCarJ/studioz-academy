import { timingSafeEqual, randomBytes } from "crypto"
import { cookies, headers } from "next/headers"

export const CSRF_COOKIE_NAME = "csrf_token"
export const CSRF_FORM_FIELD = "csrfToken"
export const CSRF_TOKEN_TTL_SECONDS = 60 * 60 * 8 // 8 hours

const CSRF_TOKEN_BYTES = 32

export function createCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_BYTES).toString("hex")
}

export function getCsrfCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CSRF_TOKEN_TTL_SECONDS,
  }
}

/**
 * Validates CSRF using double-submit cookie pattern plus Origin/Host check.
 */
export async function isValidCsrfToken(formData: FormData): Promise<boolean> {
  const submittedToken = formData.get(CSRF_FORM_FIELD)
  if (typeof submittedToken !== "string" || submittedToken.length === 0) {
    return false
  }

  const cookieStore = await cookies()
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value
  if (!cookieToken) {
    return false
  }

  const headerStore = await headers()
  const origin = headerStore.get("origin")
  const host = headerStore.get("host")

  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return false
      }
    } catch {
      return false
    }
  }

  const submittedBuffer = Buffer.from(submittedToken)
  const cookieBuffer = Buffer.from(cookieToken)

  if (submittedBuffer.length !== cookieBuffer.length) {
    return false
  }

  return timingSafeEqual(submittedBuffer, cookieBuffer)
}
