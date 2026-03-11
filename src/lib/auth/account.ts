import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]

export type AccountState = "active" | "deleted" | "missing_profile"

export interface AccountStatus {
  state: AccountState
  role: ProfileRow["role"] | null
}

const FULL_NAME_ALLOWED_RE = /^[\p{L} .'-]+$/u

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export function normalizeFullName(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

export function validateFullName(value: string) {
  const normalized = normalizeFullName(value)

  if (!normalized) {
    return "El nombre es obligatorio."
  }

  if (normalized.length < 2 || normalized.length > 80) {
    return "El nombre debe tener entre 2 y 80 caracteres."
  }

  if (!FULL_NAME_ALLOWED_RE.test(normalized)) {
    return "El nombre solo puede incluir letras, espacios, apostrofes, puntos y guiones."
  }

  const letterCount = Array.from(normalized).filter((char) => /\p{L}/u.test(char)).length
  if (letterCount < 2) {
    return "El nombre debe incluir al menos 2 letras."
  }

  return null
}

export async function resolveAccountStatusByUserId(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<AccountStatus> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, deleted_at")
    .eq("id", userId)
    .maybeSingle()

  if (!profile) {
    return { state: "missing_profile", role: null }
  }

  if (profile.deleted_at) {
    return { state: "deleted", role: profile.role }
  }

  return { state: "active", role: profile.role }
}
