"use client"
import { Button } from "@/components/ui/button"
export default function AuditError({ reset }: { reset: () => void }) {
  return <section className="space-y-4"><h1 className="text-2xl font-bold">No pudimos cargar el historial</h1><p role="alert">Inténtalo de nuevo. Tus filtros se conservarán.</p><Button onClick={reset}>Volver a intentar</Button></section>
}
