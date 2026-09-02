import { Suspense } from "react"
import { listAllReviews } from "@/actions/admin/reviews"
import { ReviewsTable } from "@/components/admin/ReviewsTable"
import { AdminTableSkeleton } from "@/components/skeletons/AdminTableSkeleton"
import { StudentPagination } from "@/components/dashboard/StudentPagination"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { normalizeReviewFilters, pageQuery } from "@/lib/admin-review-audit"

export const metadata = { title: "Reseñas — Admin | Studio Z" }
type Query = Record<string, string | string[] | undefined>

async function ReviewsList({ query }: { query: Query }) {
  const result = await listAllReviews(query)
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground" role="status">{result.total} reseñas encontradas</p>
    <ReviewsTable reviews={result.items} />
    <StudentPagination pathname="/admin/resenas" page={result.page} pageSize={result.pageSize} total={result.total} query={pageQuery(normalizeReviewFilters(query))} />
  </div>
}

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams
  const filters = normalizeReviewFilters(query)
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reseñas</h1>
        <p className="mt-2 text-muted-foreground">Revisa los comentarios y oculta o elimina las reseñas inapropiadas.</p>
      </div>
      <form className="grid items-end gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-2 text-sm font-medium">Estudiante o comentario
          <Input name="search" defaultValue={filters.search} placeholder="Buscar reseñas" maxLength={120} />
        </label>
        <label className="space-y-2 text-sm font-medium">Curso
          <Input name="course" defaultValue={filters.course} placeholder="Nombre del curso" maxLength={120} />
        </label>
        <label className="space-y-2 text-sm font-medium">Visibilidad
          <select name="visibility" defaultValue={filters.visibility} className="min-h-11 w-full rounded-md border bg-background px-3">
            <option value="">Todas</option><option value="visible">Visibles</option><option value="hidden">Ocultas</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium">Calificación
          <select name="rating" defaultValue={filters.rating ?? ""} className="min-h-11 w-full rounded-md border bg-background px-3">
            <option value="">Todas</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} {rating === 1 ? "estrella" : "estrellas"}</option>)}
          </select>
        </label>
        <Button type="submit" className="min-h-11">Aplicar filtros</Button>
      </form>
      <Suspense key={JSON.stringify(filters)} fallback={<AdminTableSkeleton rows={8} />}>
        <ReviewsList query={query} />
      </Suspense>
    </section>
  )
}
