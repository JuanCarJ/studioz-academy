"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { retryAccountAuthCleanup } from "@/actions/admin/account-cleanup"
import { Button } from "@/components/ui/button"

export function AccountCleanupPanel({ userId, completedAt, attempts }: {
  userId: string; completedAt: string | null; attempts: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ success?: boolean; error?: string }>({})
  const complete = Boolean(completedAt || result.success)
  return <section className="max-w-2xl space-y-3 rounded-xl border p-5">
    <h2 className="text-xl font-semibold">Eliminación de cuenta</h2>
    <p className="text-sm">{complete ? "La cuenta está desactivada y la identidad de acceso fue eliminada." : "La cuenta ya está desactivada. Falta confirmar la eliminación de su identidad de acceso."}</p>
    <p className="text-sm text-muted-foreground">Las compras se conservan anonimizadas. Intentos realizados: {attempts}.</p>
    {result.error && <p role="alert" className="text-sm text-destructive">{result.error}</p>}
    {result.success && <p role="status" className="text-sm">Eliminación confirmada.</p>}
    {!complete && <Button disabled={pending} onClick={() => {
      setResult({})
      start(async () => {
        try { setResult(await retryAccountAuthCleanup(userId)); router.refresh() }
        catch { setResult({ error: "No pudimos confirmar el resultado. Actualiza la ficha antes de reintentar." }) }
      })
    }}>{pending ? "Comprobando…" : "Reintentar eliminación de acceso"}</Button>}
  </section>
}
