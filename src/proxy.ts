import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const publicRoutes = [
  "/",
  "/cursos",
  "/servicios",
  "/galeria",
  "/noticias",
  "/eventos",
  "/contacto",
  "/pago/retorno",
  "/politica-de-privacidad",
  "/terminos",
  "/politica-de-reembolso",
]

const authRoutes = ["/login", "/registro", "/recuperar-password"]
const SUPABASE_AUTH_COOKIE_RE = /^sb-.+-auth-token(?:\.\d+)?$/

function isPublicRoute(path: string): boolean {
  return (
    publicRoutes.includes(path) ||
    path.startsWith("/cursos/") ||
    path.startsWith("/instructores/") ||
    path.startsWith("/noticias/") ||
    path.startsWith("/api/webhooks/") ||
    path.startsWith("/api/jobs/") ||
    path.startsWith("/api/csrf") ||
    path.startsWith("/auth/callback")
  )
}

function isAuthRoute(path: string): boolean {
  return authRoutes.some(
    (route) => path === route || path.startsWith(route + "/")
  )
}

function stringFromBase64Url(value: string) {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=")

  const binary = atob(normalized)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

  return new TextDecoder().decode(bytes)
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

function getRefreshTokenFromRequest(request: NextRequest): string | null {
  const authCookies = request.cookies
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

async function getUserWithRecovery(
  request: NextRequest,
  supabase: ReturnType<typeof createServerClient>
) {
  const userResult = await supabase.auth.getUser()
  if (userResult.data.user) {
    return userResult.data.user
  }

  const sessionResult = await supabase.auth.getSession()
  const refreshToken =
    sessionResult.data.session?.refresh_token ?? getRefreshTokenFromRequest(request)

  if (!refreshToken) return null

  const refreshResult = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  })

  return refreshResult.data.user ?? null
}

function copySupabaseCookies(
  targetResponse: NextResponse,
  sourceResponse: NextResponse
) {
  sourceResponse.cookies.getAll().forEach((cookie) => {
    targetResponse.cookies.set(cookie)
  })

  return targetResponse
}

function redirectWithSupabaseCookies(
  url: URL,
  sourceResponse: NextResponse
) {
  return copySupabaseCookies(NextResponse.redirect(url), sourceResponse)
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Create Supabase client and refresh auth session for ALL routes.
  // This follows the Supabase recommended pattern: session refresh must
  // happen before any route-matching logic.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session for ALL routes — do not put code between
  // createServerClient and getUser()
  const user = await getUserWithRecovery(request, supabase)

  // Public routes: always accessible (session already refreshed above)
  if (isPublicRoute(path)) return supabaseResponse

  // Auth routes: redirect if already logged in
  if (isAuthRoute(path)) {
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()

      const dest = profile?.role === "admin" ? "/admin" : "/dashboard"
      return redirectWithSupabaseCookies(
        new URL(dest, request.url),
        supabaseResponse
      )
    }
    return supabaseResponse
  }

  // Protected routes: require authentication
  if (!user) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", path)
    return redirectWithSupabaseCookies(loginUrl, supabaseResponse)
  }

  // Admin routes: require admin role
  if (path.startsWith("/admin")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile?.role !== "admin") {
      return redirectWithSupabaseCookies(
        new URL("/dashboard", request.url),
        supabaseResponse
      )
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
