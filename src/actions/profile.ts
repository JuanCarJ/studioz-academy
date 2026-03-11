"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { normalizeFullName, validateFullName } from "@/lib/auth/account"
import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { clearSupabaseAuthTokenCookies } from "@/lib/supabase/cookies"

export interface ProfileActionState {
  error?: string
  success?: boolean
}

const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"]

export async function updateProfile(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const user = await getCurrentUser()
  if (!user) return { error: "Debes iniciar sesion." }

  const fullName = normalizeFullName((formData.get("fullName") as string) ?? "")
  const phone = (formData.get("phone") as string) || null
  const emailNotifications = formData.get("emailNotifications") === "on"

  const fullNameError = validateFullName(fullName)
  if (fullNameError) {
    return { error: fullNameError }
  }

  const supabase = await createServerClient()

  const updateData: Record<string, unknown> = {
    full_name: fullName,
    phone,
    email_notifications: emailNotifications,
  }

  // H-07: Handle avatar upload
  const avatarFile = formData.get("avatar") as File | null
  if (avatarFile && avatarFile.size > 0) {
    if (!ALLOWED_AVATAR_TYPES.includes(avatarFile.type)) {
      return { error: "Solo se permiten imagenes JPG, PNG o WebP." }
    }
    if (avatarFile.size > MAX_AVATAR_SIZE) {
      return { error: "La imagen no puede superar 2 MB." }
    }

    const ext = avatarFile.name.split(".").pop() ?? "jpg"
    const path = `${user.id}/avatar.${ext}`

    const adminSupabase = createServiceRoleClient()

    const { error: uploadError } = await adminSupabase.storage
      .from("avatars")
      .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type })

    if (uploadError) {
      return { error: "No se pudo subir la imagen. Intenta de nuevo." }
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
  if (!user) return { error: "Debes iniciar sesion." }

  const supabase = await createServerClient()
  const adminSupabase = createServiceRoleClient()

  const { error: rpcError } = await supabase.rpc("anonymize_user_data", {
    target_user_id: user.id,
  })

  if (rpcError) {
    return { error: "No se pudo procesar la eliminacion. Contacta soporte." }
  }

  const { error: deleteAuthError } = await adminSupabase.auth.admin.deleteUser(user.id, true)
  if (deleteAuthError) {
    return {
      error:
        "No se pudo completar la eliminacion de la cuenta. Intenta de nuevo o contacta soporte.",
    }
  }

  await supabase.auth.signOut()
  await clearSupabaseAuthTokenCookies()

  revalidatePath("/", "layout")
  redirect("/")
}
