"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import {
  buildOAuthNextPath,
  getSafeRedirectPath,
  parseAuthIntentFromFormData,
  stripAuthIntentParams,
} from "@/lib/auth-intent"
import {
  normalizeEmail,
  normalizeFullName,
  resolveAccountStatusByUserId,
  validateFullName,
} from "@/lib/auth/account"
import {
  buildInvalidCredentialsError,
  SAFE_SIGNUP_RETRY_MESSAGE,
} from "@/lib/auth/messages"
import { resolvePostAuthIntentRedirect } from "@/lib/auth-intent-server"
import { isValidCsrfToken } from "@/lib/security/csrf"
import { clearSupabaseAuthTokenCookies } from "@/lib/supabase/cookies"
import { createServerClient } from "@/lib/supabase/server"

export interface AuthActionState {
  error?: string
  success?: boolean
}

const INVALID_CSRF_MESSAGE =
  "La solicitud venció. Recarga la página e inténtalo de nuevo."

export async function register(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!(await isValidCsrfToken(formData))) {
    return { error: INVALID_CSRF_MESSAGE }
  }

  const email = normalizeEmail((formData.get("email") as string) ?? "")
  const password = formData.get("password") as string
  const fullName = normalizeFullName((formData.get("fullName") as string) ?? "")
  const phone = (formData.get("phone") as string) || undefined
  const acceptsPrivacy = formData.get("acceptsPrivacy")
  const redirectTo = getSafeRedirectPath(formData.get("redirect") as string | null)

  if (!email || !password || !fullName) {
    return { error: "Completa los campos obligatorios." }
  }

  if (acceptsPrivacy !== "on") {
    return { error: "Debes aceptar la política de privacidad." }
  }

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." }
  }

  const fullNameError = validateFullName(fullName)
  if (fullNameError) {
    return { error: fullNameError }
  }

  await clearSupabaseAuthTokenCookies()
  const supabase = await createServerClient()

  const { data, error } = await supabase.auth.signUp({
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
    return { error: SAFE_SIGNUP_RETRY_MESSAGE }
  }

  const isAmbiguousSignup =
    Array.isArray(data.user?.identities) && data.user.identities.length === 0
  if (!data.user || isAmbiguousSignup) {
    return { error: SAFE_SIGNUP_RETRY_MESSAGE }
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

  const email = normalizeEmail((formData.get("email") as string) ?? "")
  const password = formData.get("password") as string
  const redirectTo = getSafeRedirectPath(formData.get("redirect") as string | null)

  if (!email || !password) {
    return { error: "Correo y contraseña son obligatorios." }
  }

  await clearSupabaseAuthTokenCookies()
  const supabase = await createServerClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return buildInvalidCredentialsError()
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const accountStatus = await resolveAccountStatusByUserId(supabase, user.id)

    if (accountStatus.state === "deleted") {
      await supabase.auth.signOut()
      await clearSupabaseAuthTokenCookies()
      redirect("/login?error=account-deleted")
    }

    if (accountStatus.state === "missing_profile") {
      await supabase.auth.signOut()
      await clearSupabaseAuthTokenCookies()
      return {
        error: "No pudimos iniciar sesión. Inténtalo de nuevo.",
      }
    }

    revalidatePath("/", "layout")

    const authIntent = parseAuthIntentFromFormData(formData, redirectTo)
    if (authIntent) {
      redirect(
        await resolvePostAuthIntentRedirect({
          supabase,
          userId: user.id,
          intent: authIntent,
          fallbackPath: accountStatus.role === "admin" ? "/admin" : "/dashboard",
        })
      )
    }

    const sanitizedRedirect = stripAuthIntentParams(redirectTo)
    if (sanitizedRedirect) {
      redirect(sanitizedRedirect)
    }

    redirect(accountStatus.role === "admin" ? "/admin" : "/dashboard")
  }

  revalidatePath("/", "layout")
  return buildInvalidCredentialsError()
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
  await clearSupabaseAuthTokenCookies()

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
    return { error: "El correo es obligatorio." }
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
    return { error: "Completa ambos campos." }
  }

  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden." }
  }

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." }
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { error: "No se pudo actualizar la contraseña. Inténtalo de nuevo." }
  }

  revalidatePath("/", "layout")
  redirect("/login?message=password-updated")
}
