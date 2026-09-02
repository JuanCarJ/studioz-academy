import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { resolveAccountStatusByUserId } from "@/lib/auth/account"
import { hasSupabaseAuthCookies } from "@/lib/supabase/request-auth"
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

function isProtectedAppGetRequest(request: NextRequest) {
  return request.method === "GET" && !request.nextUrl.pathname.startsWith("/api")
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
  const nonce = btoa(crypto.randomUUID())
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://checkout.bold.co https://assets.mediadelivery.net`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.bold.co https://*.bunnycdn.com https://*.mediadelivery.net https://vitals.vercel-insights.com",
    "frame-src https://*.bold.co https://*.mediadelivery.net https://www.google.com https://maps.google.com",
    "frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'",
    "form-action 'self' https://checkout.bold.co",
  ].join("; ")
  request.headers.set("x-nonce", nonce)
  request.headers.set("Content-Security-Policy", csp)
  const response = await routeRequest(request)
  response.headers.set("Content-Security-Policy", csp)
  return response
}

async function routeRequest(request: NextRequest) {
  const path = request.nextUrl.pathname
  const hasAuthCookies = hasSupabaseAuthCookies(request.cookies)

  // Anonymous public traffic needs no authentication roundtrip. Server actions still enforce their own authorization.
  if (!hasAuthCookies && (isPublicRoute(path) || isAuthRoute(path))) return NextResponse.next({ request })

  // Refresh existing authentication cookies before protected routing.
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
  const user = await getSupabaseUserWithRecovery(supabase, request.cookies, {
    context: {
      source: "proxy",
      path,
      method: request.method,
    },
  })
  const serverActionRequest = isServerActionRequest(request)

  let accountStatus:
    | Awaited<ReturnType<typeof resolveAccountStatusByUserId>>
    | null = null

  if (user) {
    accountStatus = await resolveAccountStatusByUserId(supabase, user.id)

    if (accountStatus.state === "deleted" || accountStatus.state === "suspended") {
      await supabase.auth.signOut()
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("error", accountStatus.state === "suspended" ? "account-suspended" : "account-deleted")
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

    if (hasAuthCookies && isProtectedAppGetRequest(request)) {
      console.warn(
        "[auth.proxy] Protected app request kept alive after session recovery returned no user; layout will re-check auth.",
        {
          path,
          method: request.method,
        }
      )
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
