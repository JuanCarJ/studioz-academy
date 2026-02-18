export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      {/* TODO: <DashboardNav /> */}
      <aside className="hidden w-64 border-r md:block">
        <nav className="p-4">
          <p className="text-sm text-muted-foreground">Panel del estudiante</p>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
