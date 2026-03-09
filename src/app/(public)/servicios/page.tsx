import Link from "next/link"

import type { Metadata } from "next"

import { getCourses } from "@/actions/courses"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Servicios — Studio Z Academy",
  description:
    "Descubre la propuesta formativa de baile y tatuaje de Studio Z Academy.",
}

const processSteps = [
  {
    title: "Descubre",
    description:
      "Entra por servicios, noticias o eventos y aterriza en la oferta correcta.",
  },
  {
    title: "Convierte",
    description:
      "El flujo conecta login, carrito y pago con contexto preservado para no perder la venta.",
  },
  {
    title: "Aprende",
    description:
      "Una vez aprobada la compra, el acceso al curso y el progreso quedan disponibles de inmediato.",
  },
]

export default async function ServiciosPage() {
  const [danceCourses, tattooCourses] = await Promise.all([
    getCourses({ category: "baile", sort: "newest" }),
    getCourses({ category: "tatuaje", sort: "newest" }),
  ])

  const sections = [
    {
      title: "Baile",
      eyebrow: "Formacion en movimiento",
      description:
        "Cursos para tecnica, expresion, montaje y continuidad de entrenamiento con clases grabadas y progresion por lecciones.",
      href: "/cursos?category=baile",
      cta: "Ver cursos de baile",
      items: danceCourses.slice(0, 3),
    },
    {
      title: "Tatuaje",
      eyebrow: "Formacion en oficio",
      description:
        "Contenido orientado a fundamentos, practica segura, criterio visual y preparacion operativa para un estudio real.",
      href: "/cursos?category=tatuaje",
      cta: "Ver cursos de tatuaje",
      items: tattooCourses.slice(0, 3),
    },
  ]

  return (
    <section className="container mx-auto space-y-16 px-4 py-16">
      <div className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.36em] text-primary">
          Servicios Studio Z
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Sitio informativo y LMS conectados a una propuesta comercial unica.
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          La plataforma combina captacion, contenido editorial, catalogo,
          carrito, checkout y experiencia de aprendizaje para las dos lineas de
          negocio de Studio Z.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {processSteps.map((step, index) => (
          <Card key={step.title} className="border-white/10">
            <CardContent className="space-y-3 pt-6">
              <p className="text-xs uppercase tracking-[0.24em] text-primary">
                0{index + 1}
              </p>
              <h2 className="text-xl font-semibold">{step.title}</h2>
              <p className="text-sm text-muted-foreground">
                {step.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title} className="border-white/10">
            <CardContent className="space-y-5 pt-6">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-primary">
                  {section.eyebrow}
                </p>
                <h2 className="mt-2 text-3xl font-semibold">
                  {section.title}
                </h2>
                <p className="mt-3 text-muted-foreground">
                  {section.description}
                </p>
              </div>

              <div className="rounded-2xl border border-dashed p-4">
                <p className="text-sm font-medium">Cursos recomendados ahora</p>
                {section.items.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No hay cursos publicados en esta linea todavia.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/cursos/${item.slug}`}
                          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Button asChild>
                <Link href={section.href}>{section.cta}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-4 pt-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold">
              Necesitas una ruta mas guiada antes de comprar?
            </h2>
            <p className="mt-2 text-muted-foreground">
              Usa contacto o WhatsApp para resolver dudas de nivel, modalidad,
              pagos y eventos disponibles.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/contacto">Ir a contacto</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/eventos">Ver eventos</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
