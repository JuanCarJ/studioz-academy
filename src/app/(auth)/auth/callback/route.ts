import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

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
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const nextUrl = new URL(next, origin)
    const addToCartId = nextUrl.searchParams.get("addToCart")

    if (addToCartId) {
      const { data: enrollment } = await supabase
        .from("enrollments")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", addToCartId)
        .maybeSingle()

      if (!enrollment) {
        const { data: existingCartItem } = await supabase
          .from("cart_items")
          .select("id")
          .eq("user_id", user.id)
          .eq("course_id", addToCartId)
          .maybeSingle()

        if (!existingCartItem) {
          await supabase.from("cart_items").insert({
            user_id: user.id,
            course_id: addToCartId,
          })
        }
      }

      next = "/carrito"
    } else if (profile?.role === "admin" && !providedNext) {
      next = "/admin"
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
