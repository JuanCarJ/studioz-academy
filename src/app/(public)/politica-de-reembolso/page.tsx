import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Politica de Reembolso — Studio Z Academy",
}

export default function PoliticaReembolsoPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-heading text-3xl font-bold">
        Politica de Reembolso
      </h1>
      <p className="mt-4 text-muted-foreground">
        Contenido en construccion. La politica de reembolso de Studio Z Academy
        sera publicada proximamente.
      </p>
    </main>
  )
}
