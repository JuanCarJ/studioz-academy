"use client"

import { Button } from "@/components/ui/button"
export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <section className="mx-auto max-w-lg space-y-4 py-16 text-center">
      <h1 className="text-2xl font-bold">No pudimos cargar esta sección</h1>
      <p className="text-muted-foreground">
        Inténtalo de nuevo. Si estabas guardando un cambio, revisa su estado
        antes de repetirlo.
      </p>
      <Button onClick={reset}>Volver a intentar</Button>
    </section>
  )
}
