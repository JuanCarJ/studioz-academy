import { AdminTableSkeleton } from "@/components/skeletons/AdminTableSkeleton"

export default function AdminUsersLoading() {
  return (
    <section className="space-y-6">
      <div>
        <div className="h-9 w-36 animate-pulse rounded-md bg-muted" />
        <div className="mt-2 h-5 w-72 animate-pulse rounded-md bg-muted" />
      </div>

      {/* Search bar skeleton */}
      <div className="flex gap-3">
        <div className="h-10 w-80 animate-pulse rounded-md bg-muted" />
        <div className="h-10 w-24 animate-pulse rounded-md bg-muted" />
      </div>

      <AdminTableSkeleton rows={10} />
    </section>
  )
}
