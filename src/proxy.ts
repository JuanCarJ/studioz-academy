import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { resolveAccountStatusByUserId } from "@/lib/auth/account"
import { getSupabaseUserWithRecovery } from "@/lib/supabase/session-recovery"

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

function isServerActionRequest(request: NextRequest) {
  return request.method === "POST" && request.headers.has("next-action")
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
  const user = await getSupabaseUserWithRecovery(supabase, request.cookies)
  const serverActionRequest = isServerActionRequest(request)

  let accountStatus:
    | Awaited<ReturnType<typeof resolveAccountStatusByUserId>>
    | null = null

  if (user) {
    accountStatus = await resolveAccountStatusByUserId(supabase, user.id)

    if (accountStatus.state === "deleted") {
      await supabase.auth.signOut()
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("error", "account-deleted")
      return redirectWithSupabaseCookies(loginUrl, supabaseResponse)
    }

    if (accountStatus.state === "missing_profile") {
      await supabase.auth.signOut()
      return redirectWithSupabaseCookies(new URL("/login", request.url), supabaseResponse)
    }
  }

  // Public routes: always accessible (session already refreshed above)
  if (isPublicRoute(path)) return supabaseResponse

  // Auth routes: redirect if already logged in
  if (isAuthRoute(path)) {
    if (user) {
      const dest = accountStatus?.role === "admin" ? "/admin" : "/dashboard"
      return redirectWithSupabaseCookies(
        new URL(dest, request.url),
        supabaseResponse
      )
    }
    return supabaseResponse
  }

  // Protected routes: require authentication
  if (!user) {
    if (serverActionRequest) {
      return supabaseResponse
    }

    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", path)
    return redirectWithSupabaseCookies(loginUrl, supabaseResponse)
  }

  // Admin routes: require admin role
  if (path.startsWith("/admin")) {
    if (accountStatus?.role !== "admin") {
      if (serverActionRequest) {
        return supabaseResponse
      }

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
