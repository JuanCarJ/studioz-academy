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
    <div className="flex min-h-screen min-w-0">
      <AdminSidebar user={adminUser} />
      <main className="min-w-0 flex-1 p-4 pt-20 md:p-6">{children}</main>
    </div>
  )
}
