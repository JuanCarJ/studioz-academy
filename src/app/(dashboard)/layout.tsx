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
      <div className="flex min-h-[calc(100vh-4rem)] min-w-0">
        <aside className="hidden w-64 border-r lg:block">
          <DashboardNav />
        </aside>
        <main className="min-w-0 flex-1 p-4 pb-28 sm:p-6 sm:pb-28 lg:pb-6">
          {children}
        </main>
      </div>
      <Footer />
    </>
  )
}
