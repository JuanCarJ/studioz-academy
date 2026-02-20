export default function Loading() {
  return (
    <section className="container mx-auto px-4 py-16">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10">
        <div className="h-32 w-32 shrink-0 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-4">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-16 w-full max-w-md animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="my-12 h-px bg-border" />
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-lg bg-muted"
          />
        ))}
      </div>
    </section>
  )
}
