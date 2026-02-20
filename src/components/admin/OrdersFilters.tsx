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

const PAYMENT_METHOD_OPTIONS = [
  { value: "all", label: "Todos los metodos" },
  { value: "CARD", label: "Tarjeta" },
  { value: "NEQUI", label: "Nequi" },
  { value: "PSE", label: "PSE" },
  { value: "BANCOLOMBIA_TRANSFER", label: "Bancolombia" },
  { value: "BANCOLOMBIA_COLLECT", label: "Bancolombia Collect" },
  { value: "EFECTY", label: "Efecty" },
]

const COMBO_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "with", label: "Con combo" },
  { value: "without", label: "Sin combo" },
]

interface OrdersFiltersProps {
  status: string
  dateFrom: string
  dateTo: string
  search: string
  paymentMethod: string
  combo: string
}

export function OrdersFilters({
  status,
  dateFrom,
  dateTo,
  search,
  paymentMethod,
  combo,
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

  const hasFilters = status !== "all" || dateFrom || dateTo || search || paymentMethod !== "all" || combo !== "all"

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

      <div className="min-w-[180px]">
        <Select
          value={paymentMethod}
          onValueChange={(val) => updateParam("paymentMethod", val)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Metodo de pago" />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_METHOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-[140px]">
        <Select
          value={combo}
          onValueChange={(val) => updateParam("combo", val)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Combo" />
          </SelectTrigger>
          <SelectContent>
            {COMBO_OPTIONS.map((opt) => (
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
          placeholder="Referencia, nombre, email o ID Wompi..."
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
