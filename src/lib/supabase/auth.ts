import { cache } from "react"

import { createServerClient } from "./server"

export const getCurrentUser = cache(async () => {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

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
