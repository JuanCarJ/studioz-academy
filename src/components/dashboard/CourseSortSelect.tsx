"use client"

import { useRouter, useSearchParams } from "next/navigation"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const SORT_OPTIONS = [
  { value: "lastAccessed", label: "Ultimo acceso" },
  { value: "progressDesc", label: "Mayor progreso" },
  { value: "progressAsc", label: "Menor progreso" },
  { value: "enrolledAt", label: "Fecha de inscripcion" },
] as const

type SortValue = (typeof SORT_OPTIONS)[number]["value"]

function isValidSort(value: string): value is SortValue {
  return SORT_OPTIONS.some((opt) => opt.value === value)
}

interface CourseSortSelectProps {
  currentSort: string
}

export function CourseSortSelect({ currentSort }: CourseSortSelectProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const activeSort: SortValue = isValidSort(currentSort) ? currentSort : "lastAccessed"

  function handleSortChange(value: string) {
    if (!isValidSort(value)) return

    const params = new URLSearchParams(searchParams.toString())

    if (value === "lastAccessed") {
      params.delete("sort")
    } else {
      params.set("sort", value)
    }

    const queryString = params.toString()
    router.push(queryString ? `?${queryString}` : "/dashboard")
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground whitespace-nowrap">Ordenar por:</span>
      <Select value={activeSort} onValueChange={handleSortChange}>
        <SelectTrigger size="sm" className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
