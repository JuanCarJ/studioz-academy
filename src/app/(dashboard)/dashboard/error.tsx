"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function StudentError({ reset }: { reset: () => void }) {
  return (
    <section className="space-y-4 rounded-xl border p-6">
      <h1 className="text-xl font-semibold">No pudimos abrir esta página</h1>
      <p className="text-sm text-muted-foreground">Revisa tu conexión y vuelve a intentarlo. Tu acceso a los cursos no cambia.</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>Volver a intentar</Button>
        <Button asChild variant="outline"><Link href="/dashboard">Ir a Mi aprendizaje</Link></Button>
      </div>
    </section>
  )
}
