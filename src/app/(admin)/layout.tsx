import { getCurrentUser } from "@/lib/supabase/auth"
import { AdminSidebar } from "@/components/layout/AdminSidebar"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  const adminUser = user
    ? { fullName: user.full_name, email: user.email }
    : null

  return (
    <div className="flex min-h-screen">
      <AdminSidebar user={adminUser} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
