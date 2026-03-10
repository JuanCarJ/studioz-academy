import { requireAdminUser } from "@/lib/auth/admin"
import { AdminSidebar } from "@/components/layout/AdminSidebar"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAdminUser()
  const adminUser = { fullName: user.full_name, email: user.email }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar user={adminUser} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
