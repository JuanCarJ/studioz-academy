export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {/* TODO: <PublicNavbar /> */}
      <main className="min-h-screen">{children}</main>
      {/* TODO: <Footer /> */}
    </>
  )
}
