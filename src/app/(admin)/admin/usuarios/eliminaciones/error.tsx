"use client"

import { Button } from "@/components/ui/button"

export default function PendingAccountCleanupsError({ reset }: { reset: () => void }) {
  return <section className="space-y-4" role="alert">
    <h1 className="text-2xl font-semibold">No pudimos cargar las solicitudes</h1>
    <p>Las cuentas siguen desactivadas. Inténtalo de nuevo para consultar las eliminaciones pendientes.</p>
    <Button onClick={reset}>Volver a intentar</Button>
  </section>
}
