import type { SupabaseClient, User } from "@supabase/supabase-js"

import { isSupabaseAuthTokenCookieName } from "@/lib/supabase/cookies"
import type { Database } from "@/types/database"

type CookieEntry = {
  name: string
  value: string
}

type CookieSource = {
  getAll(): CookieEntry[]
}

interface SessionRecoveryContext {
  source: string
  path?: string
  method?: string
}

interface SessionRecoveryOptions {
  context?: SessionRecoveryContext
}

const RETRYABLE_REFRESH_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504])
const RETRYABLE_REFRESH_MESSAGE_RE =
  /(network|fetch failed|timeout|timed out|temporar|rate limit|too many requests|econnreset|socket hang up|enotfound|dns|upstream)/i
const MAX_REFRESH_ATTEMPTS = 2
const REFRESH_RETRY_DELAY_MS = 150

type SessionRecoveryErrorMetadata = {
  code?: string
  message?: string
  name?: string
  status?: number
}

function getSupabaseAuthCookies(cookieSource: CookieSource) {
  return cookieSource
    .getAll()
    .filter((cookie) => isSupabaseAuthTokenCookieName(cookie.name))
}

function buildRecoveryContext(context?: SessionRecoveryContext) {
  return {
    source: context?.source ?? "unknown",
    ...(context?.path ? { path: context.path } : {}),
    ...(context?.method ? { method: context.method } : {}),
  }
}

function getErrorMetadata(error: unknown): SessionRecoveryErrorMetadata {
  if (error instanceof Error) {
    const typedError = error as Error & {
      code?: string
      status?: number
    }

    return {
      name: typedError.name,
      message: typedError.message,
      code: typedError.code,
      status: typedError.status,
    }
  }

  if (!error || typeof error !== "object") {
    return { message: typeof error === "string" ? error : undefined }
  }

  const record = error as Record<string, unknown>

  return {
    code: typeof record.code === "string" ? record.code : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
    name: typeof record.name === "string" ? record.name : undefined,
    status: typeof record.status === "number" ? record.status : undefined,
  }
}

function isRetryableRefreshError(error: unknown) {
  const { message, status } = getErrorMetadata(error)

  return (
    (typeof status === "number" && RETRYABLE_REFRESH_STATUSES.has(status)) ||
    (typeof message === "string" && RETRYABLE_REFRESH_MESSAGE_RE.test(message))
  )
}

async function waitForRetry(delayMs: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

function stringFromBase64Url(value: string) {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=")

  if (typeof atob === "function") {
    const binary = atob(normalized)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

    return new TextDecoder().decode(bytes)
  }

  return Buffer.from(normalized, "base64").toString("utf8")
}

function decodeSupabaseAuthCookie(value: string) {
  const raw = value.startsWith("base64-")
    ? stringFromBase64Url(value.slice("base64-".length))
    : value

  try {
    return JSON.parse(raw) as {
      refresh_token?: string
    }
  } catch {
    return null
  }
}

function getRefreshTokenFromCookies(cookieSource: CookieSource): string | null {
  const authCookies = getSupabaseAuthCookies(cookieSource)

  if (authCookies.length === 0) return null

  const unchunkedCookie = authCookies.find(
    (cookie) => !cookie.name.match(/\.\d+$/)
  )

  if (unchunkedCookie) {
    return decodeSupabaseAuthCookie(unchunkedCookie.value)?.refresh_token ?? null
  }

  const chunkedCookies = authCookies
    .map((cookie) => {
      const match = cookie.name.match(/^(.*)\.(\d+)$/)
      if (!match) return null

      return {
        baseName: match[1],
        index: Number(match[2]),
        value: cookie.value,
      }
    })
    .filter((cookie) => cookie != null)

  if (chunkedCookies.length === 0) return null

  const baseName = chunkedCookies[0].baseName
  const chunks = chunkedCookies
    .filter((cookie) => cookie.baseName === baseName)
    .sort((a, b) => a.index - b.index)

  let combined = ""
  for (let expectedIndex = 0; expectedIndex < chunks.length; expectedIndex += 1) {
    const chunk = chunks[expectedIndex]
    if (chunk.index !== expectedIndex) break
    combined += chunk.value
  }

  if (!combined) return null

  return decodeSupabaseAuthCookie(combined)?.refresh_token ?? null
}

async function refreshUserWithRetry(
  supabase: SupabaseClient<Database>,
  refreshToken: string,
  options?: SessionRecoveryOptions
) {
  const logContext = buildRecoveryContext(options?.context)

  for (let attempt = 1; attempt <= MAX_REFRESH_ATTEMPTS; attempt += 1) {
    let refreshError: unknown = null

    try {
      const refreshResult = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      })

      if (refreshResult.data.user) {
        if (attempt > 1) {
          console.info("[auth.session-recovery] Refresh succeeded after retry.", {
            ...logContext,
            attempt,
          })
        }

        return refreshResult.data.user
      }

      refreshError =
        refreshResult.error ??
        new Error("refreshSession completed without returning a user.")
    } catch (error) {
      refreshError = error
    }

    const retryable = isRetryableRefreshError(refreshError)
    const hasMoreAttempts = attempt < MAX_REFRESH_ATTEMPTS
    const errorMetadata = getErrorMetadata(refreshError)

    if (retryable && hasMoreAttempts) {
      console.warn("[auth.session-recovery] Refresh failed; retrying once.", {
        ...logContext,
        attempt,
        retryable,
        ...errorMetadata,
      })
      await waitForRetry(REFRESH_RETRY_DELAY_MS * attempt)
      continue
    }

    const logPayload = {
      ...logContext,
      attempt,
      retryable,
      ...errorMetadata,
    }

    if (retryable) {
      console.error("[auth.session-recovery] Refresh failed after retry.", logPayload)
    } else {
      console.warn("[auth.session-recovery] Refresh failed; session not recovered.", logPayload)
    }

    return null
  }

  return null
}

export async function getSupabaseUserWithRecovery(
  supabase: SupabaseClient<Database>,
  cookieSource: CookieSource,
  options?: SessionRecoveryOptions
): Promise<User | null> {
  const userResult = await supabase.auth.getUser()
  if (userResult.data.user) {
    return userResult.data.user
  }

  const authCookies = getSupabaseAuthCookies(cookieSource)

  const sessionResult = await supabase.auth.getSession()
  const refreshToken =
    sessionResult.data.session?.refresh_token ??
    getRefreshTokenFromCookies(cookieSource)

  if (!refreshToken) {
    if (authCookies.length > 0) {
      console.warn(
        "[auth.session-recovery] Refresh token missing while auth cookies are present.",
        {
          ...buildRecoveryContext(options?.context),
          authCookieCount: authCookies.length,
          authCookieNames: authCookies.map((cookie) => cookie.name),
        }
      )
    }

    return null
  }

  return refreshUserWithRetry(supabase, refreshToken, options)
}
