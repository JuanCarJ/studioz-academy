const SUPABASE_AUTH_TOKEN_COOKIE_RE = /^sb-.+-auth-token(?:\.\d+)?$/

export function isSupabaseAuthTokenCookieName(name: string): boolean {
  return SUPABASE_AUTH_TOKEN_COOKIE_RE.test(name)
}
