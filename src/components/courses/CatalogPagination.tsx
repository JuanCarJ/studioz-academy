import Link from "next/link"
import { Button } from "@/components/ui/button"
import { catalogHref, type CatalogFilters } from "@/lib/catalog"

export function CatalogPagination({ filters, page, pageSize, total }: {
  filters: CatalogFilters
  page: number
  pageSize: number
  total: number
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return (
    <nav aria-label="Páginas del catálogo" className="mt-8 flex flex-wrap items-center justify-center gap-3">
      {page > 1
        ? <Button asChild variant="outline" className="min-h-11"><Link href={catalogHref(filters, page - 1)}>Anterior</Link></Button>
        : <Button variant="outline" className="min-h-11" disabled>Anterior</Button>}
      <span className="text-sm text-muted-foreground" aria-current="page">Página {page} de {pages}</span>
      {page < pages
        ? <Button asChild variant="outline" className="min-h-11"><Link href={catalogHref(filters, page + 1)}>Siguiente</Link></Button>
        : <Button variant="outline" className="min-h-11" disabled>Siguiente</Button>}
    </nav>
  )
}
