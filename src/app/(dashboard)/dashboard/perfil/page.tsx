import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/supabase/auth"
import { ProfileForm } from "@/components/dashboard/ProfileForm"

export const metadata = { title: "Mi Perfil — Studio Z Academy" }

export default async function ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  return (
    <section className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mi perfil</h1>
        <p className="mt-2 text-muted-foreground">
          Administra tu informacion personal.
        </p>
      </div>

      <ProfileForm
        defaultValues={{
          fullName: user.full_name,
          email: user.email,
          phone: user.phone ?? "",
          emailNotifications: user.email_notifications,
        }}
      />
    </section>
  )
}
