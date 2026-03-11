import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { resolveAccountStatusByUserId } from "@/lib/auth/account"
import { resolveAuthIntent, stripAuthIntentParams } from "@/lib/auth-intent"
import { resolvePostAuthIntentRedirect } from "@/lib/auth-intent-server"
import { isSupabaseAuthTokenCookieName } from "@/lib/supabase/cookies"
import { createServerClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const providedNext = searchParams.get("next")
  let next = providedNext ?? "/dashboard"

  // Prevent open redirect: only allow relative paths, block protocol-relative URLs
  if (!next.startsWith("/") || next.startsWith("//")) {
    next = "/dashboard"
  }

  // No code provided — redirect to login with error
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no-code`)
  }

  // Clear stale auth-token chunks while preserving OAuth PKCE verifier cookie.
  const cookieStore = await cookies()
  for (const cookie of cookieStore.getAll()) {
    if (isSupabaseAuthTokenCookieName(cookie.name)) {
      cookieStore.delete(cookie.name)
    }
  }

  const supabase = await createServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=callback`)
  }

  // Check role to redirect admin appropriately
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const accountStatus = await resolveAccountStatusByUserId(supabase, user.id)

    if (accountStatus.state === "deleted") {
      await supabase.auth.signOut()
      const response = NextResponse.redirect(`${origin}/login?error=account-deleted`)
      for (const cookie of cookieStore.getAll()) {
        if (isSupabaseAuthTokenCookieName(cookie.name)) {
          response.cookies.delete(cookie.name)
        }
      }
      return response
    }

    if (accountStatus.state === "missing_profile") {
      await supabase.auth.signOut()
      const response = NextResponse.redirect(`${origin}/login?error=callback`)
      for (const cookie of cookieStore.getAll()) {
        if (isSupabaseAuthTokenCookieName(cookie.name)) {
          response.cookies.delete(cookie.name)
        }
      }
      return response
    }

    const nextUrl = new URL(next, origin)
    const authIntent = resolveAuthIntent({
      redirectTo: `${nextUrl.pathname}${nextUrl.search}`,
      intent: nextUrl.searchParams.get("intent"),
      courseId: nextUrl.searchParams.get("courseId"),
      addToCart: nextUrl.searchParams.get("addToCart"),
    })

    if (authIntent) {
      next = await resolvePostAuthIntentRedirect({
        supabase,
        userId: user.id,
        fallbackPath: accountStatus.role === "admin" ? "/admin" : "/dashboard",
        intent: authIntent,
      })
    } else if (accountStatus.role === "admin" && !providedNext) {
      next = "/admin"
    } else {
      next = stripAuthIntentParams(next) ?? next
    }
  }

  revalidatePath("/", "layout")

  const forwardedHost = request.headers.get("x-forwarded-host")
  const isLocalEnv = process.env.NODE_ENV === "development"

  if (isLocalEnv) {
    return NextResponse.redirect(`${origin}${next}`)
  } else if (forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`)
  } else {
    return NextResponse.redirect(`${origin}${next}`)
  }
}
