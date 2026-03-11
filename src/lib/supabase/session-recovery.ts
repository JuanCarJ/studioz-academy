import type { SupabaseClient, User } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

type CookieEntry = {
  name: string
  value: string
}

type CookieSource = {
  getAll(): CookieEntry[]
}

const SUPABASE_AUTH_COOKIE_RE = /^sb-.+-auth-token(?:\.\d+)?$/

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
  const authCookies = cookieSource
    .getAll()
    .filter((cookie) => SUPABASE_AUTH_COOKIE_RE.test(cookie.name))

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

export async function getSupabaseUserWithRecovery(
  supabase: SupabaseClient<Database>,
  cookieSource: CookieSource
): Promise<User | null> {
  const userResult = await supabase.auth.getUser()
  if (userResult.data.user) {
    return userResult.data.user
  }

  const sessionResult = await supabase.auth.getSession()
  const refreshToken =
    sessionResult.data.session?.refresh_token ??
    getRefreshTokenFromCookies(cookieSource)

  if (!refreshToken) return null

  const refreshResult = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  })

  return refreshResult.data.user ?? null
}
