import { AdminTableSkeleton } from "@/components/skeletons/AdminTableSkeleton"

export default function Loading() {
  return (
    <section className="space-y-6">
      <div>
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
      <div className="rounded-lg border">
        <AdminTableSkeleton rows={8} />
      </div>
    </section>
  )
}
