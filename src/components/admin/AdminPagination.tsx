"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"

interface AdminPaginationProps {
  page: number
  totalCount: number
  pageSize: number
}

export function AdminPagination({
  page,
  totalCount,
  pageSize,
}: AdminPaginationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const totalPages = Math.ceil(totalCount / pageSize)
  const hasPrev = page > 1
  const hasNext = page < totalPages

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", String(p))
    router.push(`${pathname}?${params.toString()}`)
  }

  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Pagina {page} de {totalPages} ({totalCount} registros)
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPrev}
          onClick={() => goToPage(page - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => goToPage(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  )
}
