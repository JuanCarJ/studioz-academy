import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <section className="container mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-xs uppercase tracking-[0.36em] text-primary">404</p>
      <h1 className="mt-4 text-5xl font-bold tracking-tight">
        Esta ruta no existe en Studio Z Academy.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
        Puede que el contenido se haya movido, el slug sea incorrecto o la
        pagina aun no este publicada.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/">Volver al inicio</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/cursos">Ir al catalogo</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/contacto">Contactar soporte</Link>
        </Button>
      </div>
    </section>
  )
}
