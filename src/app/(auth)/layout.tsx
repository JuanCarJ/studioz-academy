export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Studio Z
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Academy</p>
        </div>
        {children}
      </div>
    </main>
  )
}
