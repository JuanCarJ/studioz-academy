import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terminos y Condiciones — Studio Z Academy",
}

export default function TerminosPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-heading text-3xl font-bold">
        Terminos y Condiciones
      </h1>
      <p className="mt-4 text-muted-foreground">
        Contenido en construccion. Los terminos y condiciones de uso de Studio Z
        Academy seran publicados proximamente.
      </p>
    </main>
  )
}
