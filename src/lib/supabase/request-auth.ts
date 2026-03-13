import { isSupabaseAuthTokenCookieName } from "@/lib/supabase/cookies"

type CookieCarrier = {
  getAll(): Array<{
    name: string
  }>
}

export function hasSupabaseAuthCookies(cookieStore: CookieCarrier) {
  return cookieStore
    .getAll()
    .some((cookie) => isSupabaseAuthTokenCookieName(cookie.name))
}
