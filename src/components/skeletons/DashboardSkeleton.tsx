export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-32 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
      </div>

      {/* Stats row skeleton */}
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-7 w-10 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Cards grid skeleton */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border overflow-hidden shadow-sm"
          >
            {/* Thumbnail placeholder */}
            <div className="aspect-video w-full animate-pulse bg-muted" />

            {/* Content placeholder */}
            <div className="p-4 space-y-3">
              {/* Title */}
              <div className="space-y-1.5">
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              </div>

              {/* Instructor */}
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="h-1.5 w-full animate-pulse rounded-full bg-muted" />
                <div className="flex justify-between">
                  <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-8 animate-pulse rounded bg-muted" />
                </div>
              </div>
            </div>

            {/* Footer placeholder */}
            <div className="flex items-center justify-between border-t px-4 py-3">
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
