"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import type { BoldCheckoutConfig } from "@/types/payment"

declare global {
  interface Window { BoldCheckout?: new (config: BoldCheckoutConfig) => { open(): void } }
}
const SCRIPT_URL = "https://checkout.bold.co/library/boldPaymentButton.js"
export function BoldCheckoutView({ config }: { config: BoldCheckoutConfig }) {
  const instance = useRef<{ open(): void } | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  useEffect(() => {
    let active = true
    let script: HTMLScriptElement | null = null
    const failed = () => { if (active) setState("error") }
    const timer = setTimeout(failed, 12000)
    const initialize = () => {
      if (!active || !window.BoldCheckout) return
      clearTimeout(timer)
      try { instance.current = new window.BoldCheckout(config); setState("ready") }
      catch { setState("error") }
    }
    if (window.BoldCheckout) initialize()
    else {
      script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`)
      if (!script) { script = document.createElement("script"); script.src = SCRIPT_URL; script.async = true; document.head.appendChild(script) }
      script.addEventListener("load", initialize, { once: true })
      script.addEventListener("error", failed, { once: true })
    }
    return () => { active = false; clearTimeout(timer); script?.removeEventListener("load", initialize); script?.removeEventListener("error", failed) }
  }, [config])
  return <div className="mx-auto max-w-lg text-center">
    <h1 className="text-2xl font-bold">Completa tu pago seguro</h1>
    <p className="mt-2 text-muted-foreground">Abriremos Bold para que elijas tu medio de pago. Tu acceso se activará solo cuando Bold confirme la transacción.</p>
    {state === "error" ? <>
      <p role="alert" className="mt-6 text-sm text-destructive">No pudimos cargar el pago. Revisa tu conexión e inténtalo nuevamente.</p>
      <Button className="mt-4" onClick={() => location.reload()}>Intentar de nuevo</Button>
    </> : <Button className="mt-6" size="lg" disabled={state !== "ready"} onClick={() => { try { instance.current?.open() } catch { setState("error") } }}>
      {state === "ready" ? "Pagar con Bold" : "Preparando pago…"}
    </Button>}
    <Button className="mt-3" variant="ghost" asChild><Link href="/carrito">Volver al carrito</Link></Button>
  </div>
}
