import { AdminTableSkeleton } from "@/components/skeletons/AdminTableSkeleton"

export default function AdminSalesLoading() {
  return (
    <section className="space-y-6">
      <div>
        <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
        <div className="mt-2 h-5 w-64 animate-pulse rounded-md bg-muted" />
      </div>

      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-lg border bg-muted"
          />
        ))}
      </div>

      {/* Filters row skeleton */}
      <div className="flex flex-wrap gap-3">
        <div className="h-10 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-10 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-10 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
      </div>

      <AdminTableSkeleton rows={8} />
    </section>
  )
}
