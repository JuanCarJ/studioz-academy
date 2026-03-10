import { requireAuthenticatedUser } from "@/lib/auth/user"
import { DashboardNav } from "@/components/layout/DashboardNav"
import { PublicNavbar } from "@/components/layout/PublicNavbar"
import { Footer } from "@/components/layout/Footer"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAuthenticatedUser()

  return (
    <>
      <PublicNavbar />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="hidden w-64 border-r md:block">
          <DashboardNav />
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
      <Footer />
    </>
  )
}
