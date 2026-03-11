import { cache } from "react"
import { cookies } from "next/headers"

import { resolveAccountStatusByUserId } from "@/lib/auth/account"
import { getSupabaseUserWithRecovery } from "@/lib/supabase/session-recovery"

import { createServerClient } from "./server"

export const getCurrentUser = cache(async () => {
  const supabase = await createServerClient()
  const cookieStore = await cookies()
  const user = await getSupabaseUserWithRecovery(supabase, cookieStore)
  if (!user) return null

  const accountStatus = await resolveAccountStatusByUserId(supabase, user.id)
  if (accountStatus.state !== "active") {
    return null
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, avatar_url, phone, email_notifications")
    .eq("id", user.id)
    .single()

  if (!profile) return null

  return {
    ...profile,
    email: user.email!,
  }
})
