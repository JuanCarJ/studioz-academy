const SUPABASE_AUTH_TOKEN_COOKIE_RE = /^sb-.+-auth-token(?:\.\d+)?$/

export function isSupabaseAuthTokenCookieName(name: string): boolean {
  return SUPABASE_AUTH_TOKEN_COOKIE_RE.test(name)
}

export async function clearSupabaseAuthTokenCookies() {
  const { cookies } = await import("next/headers")
  const cookieStore = await cookies()

  for (const cookie of cookieStore.getAll()) {
    if (isSupabaseAuthTokenCookieName(cookie.name)) {
      cookieStore.delete(cookie.name)
    }
  }
}
