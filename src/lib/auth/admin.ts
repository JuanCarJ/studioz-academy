import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/supabase/auth"

export async function requireAdminUser() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/login")
  }

  if (user.role !== "admin") {
    redirect("/dashboard")
  }

  return user
}
