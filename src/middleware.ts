import { NextRequest, NextResponse } from "next/server"

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
]

const authRoutes = ["/login", "/registro", "/recuperar-password"]

function isPublicRoute(path: string): boolean {
  return (
    publicRoutes.includes(path) ||
    path.startsWith("/cursos/") ||
    path.startsWith("/instructores/") ||
    path.startsWith("/noticias/") ||
    path.startsWith("/api/webhooks/")
  )
}

function isAuthRoute(path: string): boolean {
  return authRoutes.includes(path)
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Public routes: always accessible
  if (isPublicRoute(path)) return NextResponse.next()

  // TODO: Get session from Supabase
  // const supabase = createServerClient(...)
  // const { data: { session } } = await supabase.auth.getSession()
  const session = null as { user: { role: string } } | null

  // Auth routes: redirect if already logged in
  if (isAuthRoute(path) && session) {
    const dest = session.user.role === "admin" ? "/admin" : "/dashboard"
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // Protected routes: require authentication
  if (!session) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", path)
    return NextResponse.redirect(loginUrl)
  }

  // Admin routes: require admin role
  if (path.startsWith("/admin") && session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
