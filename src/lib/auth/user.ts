import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/supabase/auth"

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/login")
  }

  return user
}
