export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      {/* TODO: <AdminSidebar /> */}
      <aside className="hidden w-64 border-r bg-zinc-50 md:block">
        <nav className="p-4">
          <p className="text-sm font-semibold">Admin Studio Z</p>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
