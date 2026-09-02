"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { normalizeFullName, validateFullName } from "@/lib/auth/account"
import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { clearSupabaseAuthTokenCookies } from "@/lib/supabase/cookies"
import { MAX_AVATAR_SIZE, normalizeAvatar } from "@/lib/security/avatar"
import { enforceRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/security/rate-limit"
import { completeAccountAuthCleanup } from "@/lib/account-cleanup"
import type { Database } from "@/types/database"

export interface ProfileActionState {
  error?: string
  success?: boolean
}

export async function updateProfile(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const user = await getCurrentUser()
  if (!user) return { error: "Debes iniciar sesión." }
  if (!(await enforceRateLimit({ scope: "profile:update", key: user.id, limit: 10, windowSeconds: 600 })).allowed) {
    return { error: RATE_LIMIT_MESSAGE }
  }

  const fullName = normalizeFullName((formData.get("fullName") as string) ?? "")
  const phone = (formData.get("phone") as string) || null
  const emailNotifications = formData.get("emailNotifications") === "on"

  const fullNameError = validateFullName(fullName)
  if (fullNameError) {
    return { error: fullNameError }
  }

  const supabase = await createServerClient()

  const updateData: Database["public"]["Tables"]["profiles"]["Update"] = {
    full_name: fullName,
    phone,
    email_notifications: emailNotifications,
  }

  // H-07: Handle avatar upload
  const avatarFile = formData.get("avatar")
  if (avatarFile instanceof File && avatarFile.size > 0) {
    if (avatarFile.size > MAX_AVATAR_SIZE) {
      return { error: "La imagen no puede superar 2 MB." }
    }

    let avatar: Buffer
    try {
      avatar = await normalizeAvatar(avatarFile)
    } catch {
      return { error: "La imagen no es válida. Elige una foto JPG, PNG o WebP." }
    }
    const path = `${user.id}/avatar.webp`

    const adminSupabase = createServiceRoleClient()

    const { error: uploadError } = await adminSupabase.storage
      .from("avatars")
      .upload(path, avatar, { upsert: true, contentType: "image/webp" })

    if (uploadError) {
      return { error: "No se pudo subir la imagen. Inténtalo de nuevo." }
    }

    const { data: urlData } = adminSupabase.storage
      .from("avatars")
      .getPublicUrl(path)

    updateData.avatar_url = urlData.publicUrl
  }

  const { error } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", user.id)

  if (error) {
    return { error: "No se pudo actualizar el perfil." }
  }

  revalidatePath("/dashboard/perfil")
  revalidatePath("/", "layout")
  return { success: true }
}

/**
 * H-11: Anonymize user data and sign out.
 * Calls the anonymize_user_data SQL function via RPC.
 */
export async function requestAccountDeletion(): Promise<ProfileActionState> {
  const user = await getCurrentUser()
  if (!user) return { error: "Debes iniciar sesión." }
  if (!(await enforceRateLimit({ scope: "profile:delete", key: user.id, limit: 3, windowSeconds: 3600 })).allowed) {
    return { error: RATE_LIMIT_MESSAGE }
  }

  const supabase = await createServerClient()

  const { error: rpcError } = await supabase.rpc("anonymize_user_data", {
    target_user_id: user.id,
  })

  if (rpcError) {
    return { error: "No se pudo procesar la eliminación. Contacta soporte." }
  }

  // deleted_at is the durable request. An Auth outage must not strand a user
  // behind getCurrentUser's deleted-account guard or leave their session open.
  await completeAccountAuthCleanup(user.id)
  try { await supabase.auth.signOut() } catch { /* Local cookies still must clear. */ }
  await clearSupabaseAuthTokenCookies()

  revalidatePath("/", "layout")
  redirect("/login?message=account-deletion-requested")
}
