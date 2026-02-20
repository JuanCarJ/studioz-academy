"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface UsersFiltersProps {
  search: string
}

export function UsersFilters({ search }: UsersFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const term = (formData.get("search") as string) ?? ""
    const params = new URLSearchParams(searchParams.toString())
    if (term) {
      params.set("search", term)
    } else {
      params.delete("search")
    }
    params.delete("page")
    router.push(`${pathname}?${params.toString()}`)
  }

  function handleClear() {
    router.push(pathname)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-3">
      <Input
        name="search"
        placeholder="Buscar por nombre, email o telefono..."
        defaultValue={search}
        className="w-80"
      />
      <Button type="submit" variant="secondary">
        Buscar
      </Button>
      {search && (
        <Button type="button" variant="ghost" onClick={handleClear}>
          Limpiar
        </Button>
      )}
    </form>
  )
}
