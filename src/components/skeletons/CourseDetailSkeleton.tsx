export function CourseDetailSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 lg:py-12">
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-[1fr_340px]">
        {/* Hero placeholder */}
        <div className="order-1">
          <div className="aspect-video w-full animate-pulse rounded-xl bg-muted" />
        </div>

        {/* Sidebar placeholder */}
        <div className="order-3 lg:order-none lg:col-start-2 lg:row-span-4 lg:row-start-1">
          <div className="space-y-5 rounded-xl border p-6">
            <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
            <div className="space-y-3 border-t pt-4">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>

        {/* Meta bar placeholder */}
        <div className="order-2 space-y-3 lg:order-none">
          <div className="flex gap-2">
            <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="h-9 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>

        {/* Content placeholder */}
        <div className="order-4 space-y-10 lg:order-none">
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
            <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-3">
            <div className="h-6 w-24 animate-pulse rounded bg-muted" />
            <div className="h-12 w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-12 w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-12 w-full animate-pulse rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    </div>
  )
}
