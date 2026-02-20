"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const CATEGORIES = [
  { value: "", label: "Todos" },
  { value: "baile", label: "Baile" },
  { value: "tatuaje", label: "Tatuaje" },
]

const SORT_OPTIONS = [
  { value: "newest", label: "Mas recientes" },
  { value: "price_asc", label: "Precio: menor a mayor" },
  { value: "price_desc", label: "Precio: mayor a menor" },
]

interface CatalogFiltersProps {
  instructors?: { id: string; full_name: string }[]
}

export function CatalogFilters({ instructors }: CatalogFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const currentCategory = searchParams.get("category") ?? ""
  const currentSearch = searchParams.get("search") ?? ""
  const currentSort = searchParams.get("sort") ?? "newest"
  const currentInstructor = searchParams.get("instructor") ?? ""

  const [searchInput, setSearchInput] = useState(currentSearch)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())

      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      })

      startTransition(() => {
        router.push(`/cursos?${params.toString()}`)
      })
    },
    [router, searchParams]
  )

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      if (searchInput !== currentSearch) {
        updateParams({ search: searchInput })
      }
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput, currentSearch, updateParams])

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat.value}
            variant={currentCategory === cat.value ? "default" : "outline"}
            size="sm"
            onClick={() => updateParams({ category: cat.value })}
            disabled={isPending}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {/* Search + instructor + sort row */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar cursos o instructores..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* H-05: Instructor filter dropdown */}
        {instructors && instructors.length > 0 && (
          <Select
            value={currentInstructor || "all"}
            onValueChange={(value) =>
              updateParams({ instructor: value === "all" ? "" : value })
            }
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Instructor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los instructores</SelectItem>
              {instructors.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={currentSort}
          onValueChange={(value) => updateParams({ sort: value })}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Pending indicator */}
      {isPending && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
      )}
    </div>
  )
}
