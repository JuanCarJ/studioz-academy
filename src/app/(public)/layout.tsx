import { PublicNavbar } from "@/components/layout/PublicNavbar"
import { Footer } from "@/components/layout/Footer"

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <PublicNavbar />
      <main className="min-h-screen pb-24 lg:pb-0">{children}</main>
      <Footer />
    </>
  )
}
