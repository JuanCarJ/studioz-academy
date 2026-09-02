import Link from "next/link"
import { Button } from "@/components/ui/button"

export function StudentPagination({ pathname, page, pageSize, total, query = {} }: {
  pathname: string
  page: number
  pageSize: number
  total: number
  query?: Record<string, string>
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages === 1 && page === 1) return null
  const href = (target: number) => `${pathname}?${new URLSearchParams({ ...query, page: String(target) })}`
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-center gap-3">
      {page > 1 && <Button asChild variant="outline" className="min-h-11"><Link href={href(Math.min(page - 1, pages))}>Anterior</Link></Button>}
      <span className="text-sm text-muted-foreground">Página {page} de {pages}</span>
      {page < pages && <Button asChild variant="outline" className="min-h-11"><Link href={href(page + 1)}>Siguiente</Link></Button>}
    </nav>
  )
}
