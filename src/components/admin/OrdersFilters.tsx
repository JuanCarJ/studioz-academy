"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useCallback } from "react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const STATUS_OPTIONS = [
  { value: "all", label: "Todos los estados" },
  { value: "pending", label: "Pendiente" },
  { value: "approved", label: "Aprobada" },
  { value: "declined", label: "Rechazada" },
  { value: "voided", label: "Anulada" },
  { value: "refunded", label: "Reembolsada" },
  { value: "chargeback", label: "Contracargo" },
]

interface OrdersFiltersProps {
  status: string
  dateFrom: string
  dateTo: string
  search: string
}

export function OrdersFilters({
  status,
  dateFrom,
  dateTo,
  search,
}: OrdersFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value && value !== "all") {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete("page")
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams]
  )

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    updateParam("search", (formData.get("search") as string) ?? "")
  }

  function handleClear() {
    router.push(pathname)
  }

  const hasFilters = status !== "all" || dateFrom || dateTo || search

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[180px]">
        <Select
          value={status}
          onValueChange={(val) => updateParam("status", val)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="dateFrom">
            Desde
          </label>
          <Input
            id="dateFrom"
            type="date"
            defaultValue={dateFrom}
            onChange={(e) => updateParam("dateFrom", e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="dateTo">
            Hasta
          </label>
          <Input
            id="dateTo"
            type="date"
            defaultValue={dateTo}
            onChange={(e) => updateParam("dateTo", e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <Input
          name="search"
          placeholder="Referencia, nombre o email..."
          defaultValue={search}
          className="w-64"
        />
        <Button type="submit" variant="secondary" size="default">
          Buscar
        </Button>
      </form>

      {hasFilters && (
        <Button variant="ghost" size="default" onClick={handleClear}>
          Limpiar filtros
        </Button>
      )}
    </div>
  )
}
