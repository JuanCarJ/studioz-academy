import { Suspense } from "react"

import { listAllReviews } from "@/actions/admin/reviews"
import { ReviewsTable } from "@/components/admin/ReviewsTable"
import { AdminTableSkeleton } from "@/components/skeletons/AdminTableSkeleton"

export const metadata = { title: "Reseñas — Admin | Studio Z" }

async function ReviewsList() {
  const reviews = await listAllReviews()
  return <ReviewsTable reviews={reviews} />
}

export default function AdminReviewsPage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reseñas</h1>
        <p className="mt-2 text-muted-foreground">
          Moderación de reseñas de cursos. Puedes ocultar o eliminar reseñas
          inapropiadas.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Suspense fallback={<AdminTableSkeleton rows={8} />}>
          <ReviewsList />
        </Suspense>
      </div>
    </section>
  )
}
