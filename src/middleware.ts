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

export async function middleware(request: NextRequest) {
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
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
      return NextResponse.redirect(new URL(dest, request.url))
    }
    return supabaseResponse
  }

  // Protected routes: require authentication
  if (!user) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", path)
    return NextResponse.redirect(loginUrl)
  }

  // Admin routes: require admin role
  if (path.startsWith("/admin")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
