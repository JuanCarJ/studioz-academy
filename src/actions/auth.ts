"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import {
  buildOAuthNextPath,
  getSafeRedirectPath,
  parseAuthIntentFromFormData,
  stripAuthIntentParams,
} from "@/lib/auth-intent"
import { resolvePostAuthIntentRedirect } from "@/lib/auth-intent-server"
import { isValidCsrfToken } from "@/lib/security/csrf"
import { isSupabaseAuthTokenCookieName } from "@/lib/supabase/cookies"
import { createServerClient } from "@/lib/supabase/server"

export interface AuthActionState {
  error?: string
  success?: boolean
}

const INVALID_CSRF_MESSAGE =
  "Solicitud invalida por seguridad. Recarga la pagina e intenta de nuevo."

/**
 * Clear Supabase auth-token cookies (base + chunks) to prevent stale
 * cookie parts from a previous session interfering with the new one.
 */
async function clearStaleAuthTokenCookies() {
  const cookieStore = await cookies()
  for (const cookie of cookieStore.getAll()) {
    if (isSupabaseAuthTokenCookieName(cookie.name)) {
      cookieStore.delete(cookie.name)
    }
  }
}

export async function register(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!(await isValidCsrfToken(formData))) {
    return { error: INVALID_CSRF_MESSAGE }
  }

  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const fullName = formData.get("fullName") as string
  const phone = (formData.get("phone") as string) || undefined
  const acceptsPrivacy = formData.get("acceptsPrivacy")
  const redirectTo = getSafeRedirectPath(formData.get("redirect") as string | null)

  if (!email || !password || !fullName) {
    return { error: "Todos los campos obligatorios deben ser completados." }
  }

  if (acceptsPrivacy !== "on") {
    return { error: "Debes aceptar la politica de privacidad para continuar." }
  }

  if (password.length < 8) {
    return { error: "La contrasena debe tener al menos 8 caracteres." }
  }

  await clearStaleAuthTokenCookies()
  const supabase = await createServerClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        phone: phone || null,
      },
    },
  })

  if (error) {
    // Generic error to avoid leaking user existence
    if (error.message.includes("already registered")) {
      return { error: "No se pudo completar el registro. Verifica tus datos e intenta de nuevo." }
    }
    return { error: "No se pudo completar el registro. Intenta de nuevo." }
  }

  revalidatePath("/", "layout")

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const authIntent = parseAuthIntentFromFormData(formData, redirectTo)
  if (authIntent && user) {
    redirect(
      await resolvePostAuthIntentRedirect({
        supabase,
        userId: user.id,
        intent: authIntent,
        fallbackPath: "/dashboard",
      })
    )
  }

  const sanitizedRedirect = stripAuthIntentParams(redirectTo)
  if (sanitizedRedirect) {
    redirect(sanitizedRedirect)
  }

  redirect("/dashboard")
}

export async function login(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!(await isValidCsrfToken(formData))) {
    return { error: INVALID_CSRF_MESSAGE }
  }

  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const redirectTo = getSafeRedirectPath(formData.get("redirect") as string | null)

  if (!email || !password) {
    return { error: "Email y contrasena son obligatorios." }
  }

  await clearStaleAuthTokenCookies()
  const supabase = await createServerClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: "Email o contrasena incorrectos." }
  }

  // Determine redirect based on role
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    revalidatePath("/", "layout")

    const authIntent = parseAuthIntentFromFormData(formData, redirectTo)
    if (authIntent) {
      redirect(
        await resolvePostAuthIntentRedirect({
          supabase,
          userId: user.id,
          intent: authIntent,
          fallbackPath: profile?.role === "admin" ? "/admin" : "/dashboard",
        })
      )
    }

    const sanitizedRedirect = stripAuthIntentParams(redirectTo)
    if (sanitizedRedirect) {
      redirect(sanitizedRedirect)
    }

    redirect(profile?.role === "admin" ? "/admin" : "/dashboard")
  }

  revalidatePath("/", "layout")
  redirect("/dashboard")
}

export async function loginWithGoogle(formData: FormData) {
  if (!(await isValidCsrfToken(formData))) {
    redirect("/login?error=csrf")
  }

  const supabase = await createServerClient()
  const nextPath = buildOAuthNextPath(formData)
  const redirectUrl = new URL("/auth/callback", process.env.NEXT_PUBLIC_APP_URL)
  redirectUrl.searchParams.set("next", nextPath)

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl.toString(),
    },
  })

  if (error || !data.url) {
    redirect("/login?error=oauth")
  }

  redirect(data.url)
}

export async function logout(formData: FormData) {
  if (!(await isValidCsrfToken(formData))) {
    redirect("/login?error=csrf")
  }

  const supabase = await createServerClient()
  await supabase.auth.signOut()
  await clearStaleAuthTokenCookies()

  revalidatePath("/", "layout")
  redirect("/")
}

export async function resetPassword(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!(await isValidCsrfToken(formData))) {
    return { error: INVALID_CSRF_MESSAGE }
  }

  const supabase = await createServerClient()

  const email = formData.get("email") as string

  if (!email) {
    return { error: "El email es obligatorio." }
  }

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/recuperar-password/confirmar`,
  })

  // Always return success to avoid leaking user existence
  return { success: true }
}

export async function updatePassword(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!(await isValidCsrfToken(formData))) {
    return { error: INVALID_CSRF_MESSAGE }
  }

  const supabase = await createServerClient()

  const password = formData.get("password") as string
  const confirmPassword = formData.get("confirmPassword") as string

  if (!password || !confirmPassword) {
    return { error: "Ambos campos son obligatorios." }
  }

  if (password !== confirmPassword) {
    return { error: "Las contrasenas no coinciden." }
  }

  if (password.length < 8) {
    return { error: "La contrasena debe tener al menos 8 caracteres." }
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { error: "No se pudo actualizar la contrasena. Intenta de nuevo." }
  }

  revalidatePath("/", "layout")
  redirect("/login?message=password-updated")
}
