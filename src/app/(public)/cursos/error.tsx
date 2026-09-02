"use client"

import { Button } from "@/components/ui/button"

export default function CatalogError({ reset }: { reset: () => void }) {
  return (
    <section className="container mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold">No pudimos cargar los cursos</h1>
      <p className="mt-2 text-muted-foreground" role="alert">Inténtalo de nuevo en un momento. Tus filtros se conservarán.</p>
      <Button className="mt-6 min-h-11" onClick={reset}>Volver a intentar</Button>
    </section>
  )
}
