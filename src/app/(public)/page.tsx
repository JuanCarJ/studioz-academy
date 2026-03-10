import Link from "next/link"

import type { Metadata } from "next"

import { getHomePageData } from "@/actions/editorial"
import { CourseGrid } from "@/components/courses/CourseGrid"
import { CountUpNumbers } from "@/components/motion/CountUpNumbers"
import { ScrollReveal } from "@/components/motion/ScrollReveal"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Studio Z Academy",
  description:
    "Cursos online de baile y tatuaje, eventos y contenido editorial para la comunidad Studio Z.",
}

function formatEventDate(date: string) {
  return new Date(date).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default async function HomePage() {
  const data = await getHomePageData()

  const serviceCards = [
    {
      title: "Baile",
      description:
        "Entrenamiento guiado, tecnica y performance con clases pensadas para avanzar por niveles.",
      href: "/cursos?category=baile",
      eyebrow: "Movimiento",
    },
    {
      title: "Tatuaje",
      description:
        "Fundamentos, seguridad, practica y criterio visual aplicados a una formacion profesional.",
      href: "/cursos?category=tatuaje",
      eyebrow: "Oficio",
    },
  ]

  const stats = [
    {
      label: "Cursos publicados",
      value: data.stats.publishedCourses,
      suffix: "+",
    },
    {
      label: "Notas y noticias",
      value: data.stats.publishedPosts,
      suffix: "",
    },
    {
      label: "Eventos activos",
      value: data.stats.upcomingEvents,
      suffix: "",
    },
    {
      label: "Momentos en galeria",
      value: data.stats.galleryItems,
      suffix: "+",
    },
  ]

  return (
    <div className="pb-16">
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.18),transparent_38%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.16),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]" />
        <div className="container relative mx-auto px-4 py-20 sm:py-24">
          <div className="grid items-end gap-12 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.36em] text-primary">
                Studio Z Academy
              </p>
              <h1 className="mt-5 text-5xl font-bold tracking-tight sm:text-6xl">
                Aprende baile y tatuaje con un flujo real de formacion.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
                Unificamos cursos online, contenido editorial, eventos y
                soporte directo para que cada estudiante avance con claridad.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/cursos">Explorar cursos</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/servicios">Ver servicios</Link>
                </Button>
                <Button asChild size="lg" variant="ghost">
                  <Link href="/contacto">Hablar con Studio Z</Link>
                </Button>
              </div>
            </div>

            <Card className="border-white/10 bg-white/5 backdrop-blur">
              <CardContent className="space-y-5 pt-6">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-primary">
                    Enfoque
                  </p>
                  <h2 className="text-2xl font-semibold">
                    Formacion, comunidad y conversion en un solo sitio.
                  </h2>
                </div>
                <div className="space-y-4 text-sm text-muted-foreground">
                  <p>
                    Publico y LMS comparten narrativa: descubre cursos,
                    profundiza con noticias, valida interes con eventos y
                    convierte sin friccion.
                  </p>
                  <p>
                    El panel admin puede operar editorial, combos y auditoria
                    desde un flujo unico.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-14">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <ScrollReveal key={stat.label}>
              <Card className="border-white/10 bg-card/70">
                <CardContent className="space-y-2 pt-6">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-4xl font-bold tracking-tight">
                    <CountUpNumbers end={stat.value} suffix={stat.suffix} />
                  </p>
                </CardContent>
              </Card>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary">
              Servicios
            </p>
            <h2 className="mt-2 text-3xl font-bold">
              Dos verticales, una misma experiencia.
            </h2>
          </div>
          <Button asChild variant="ghost">
            <Link href="/servicios">Ver detalle</Link>
          </Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {serviceCards.map((card) => (
            <ScrollReveal key={card.title}>
              <Card className="overflow-hidden border-white/10">
                <CardContent className="pt-6">
                  <p className="text-xs uppercase tracking-[0.3em] text-primary">
                    {card.eyebrow}
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold">{card.title}</h3>
                  <p className="mt-3 max-w-xl text-muted-foreground">
                    {card.description}
                  </p>
                  <Button asChild className="mt-6">
                    <Link href={card.href}>Entrar a {card.title}</Link>
                  </Button>
                </CardContent>
              </Card>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 py-14">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary">
              Cursos destacados
            </p>
            <h2 className="mt-2 text-3xl font-bold">
              Oferta activa conectada a conversion real.
            </h2>
          </div>
          <Button asChild variant="ghost">
            <Link href="/cursos">Ver catalogo completo</Link>
          </Button>
        </div>
        <CourseGrid courses={data.featuredCourses} />
      </section>

      <section className="container mx-auto grid gap-14 px-4 py-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-primary">
                Noticias
              </p>
              <h2 className="mt-2 text-3xl font-bold">
                Contenido reciente para alimentar demanda.
              </h2>
            </div>
            <Button asChild variant="ghost">
              <Link href="/noticias">Ir a noticias</Link>
            </Button>
          </div>

          <div className="space-y-4">
            {data.latestPosts.length === 0 && (
              <Card>
                <CardContent className="pt-6 text-muted-foreground">
                  No hay noticias publicadas por ahora.
                </CardContent>
              </Card>
            )}

            {data.latestPosts.map((post) => (
              <ScrollReveal key={post.id}>
                <Link href={`/noticias/${post.slug}`} className="block">
                  <Card className="overflow-hidden border-white/10 transition-transform hover:-translate-y-1">
                    <CardContent className="grid gap-4 pt-6 sm:grid-cols-[180px_1fr]">
                      <div
                        className="aspect-[4/3] rounded-2xl bg-cover bg-center"
                        style={{
                          backgroundImage: post.cover_image_url
                            ? `url("${post.cover_image_url}")`
                            : undefined,
                        }}
                      >
                        {!post.cover_image_url && (
                          <div className="flex h-full items-center justify-center rounded-2xl bg-muted text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Studio Z
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                          {post.published_at
                            ? new Date(post.published_at).toLocaleDateString(
                                "es-CO",
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                }
                              )
                            : "Borrador"}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold">
                          {post.title}
                        </h3>
                        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                          {post.excerpt || "Leer mas sobre esta publicacion."}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-primary">
                Eventos
              </p>
              <h2 className="mt-2 text-3xl font-bold">
                Activaciones presenciales y agenda de comunidad.
              </h2>
            </div>
            <Button asChild variant="ghost">
              <Link href="/eventos">Ver agenda</Link>
            </Button>
          </div>

          <div className="space-y-4">
            {data.upcomingEvents.length === 0 && (
              <Card>
                <CardContent className="pt-6 text-muted-foreground">
                  No hay eventos proximos publicados.
                </CardContent>
              </Card>
            )}

            {data.upcomingEvents.map((event) => (
              <ScrollReveal key={event.id}>
                <Card className="overflow-hidden border-white/10">
                  {event.image_url && (
                    <div
                      className="aspect-[16/9] bg-cover bg-center"
                      style={{ backgroundImage: `url("${event.image_url}")` }}
                    />
                  )}
                  <CardContent className="pt-6">
                    <p className="text-xs uppercase tracking-[0.24em] text-primary">
                      {formatEventDate(event.event_date)}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold">
                      {event.title}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {event.description || "Evento publicado por Studio Z."}
                    </p>
                    {event.location && (
                      <p className="mt-3 text-sm font-medium">
                        {event.location}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary">
              Galeria
            </p>
            <h2 className="mt-2 text-3xl font-bold">
              Senales visuales de confianza y comunidad.
            </h2>
          </div>
          <Button asChild variant="ghost">
            <Link href="/galeria">Abrir galeria</Link>
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.galleryPreview.length === 0 && (
            <Card className="sm:col-span-2 lg:col-span-3">
              <CardContent className="pt-6 text-muted-foreground">
                La galeria aun no tiene elementos publicados.
              </CardContent>
            </Card>
          )}

          {data.galleryPreview.map((item) => (
            <div
              key={item.id}
              className="overflow-hidden rounded-3xl border border-white/10"
            >
              <div
                className="aspect-[4/5] bg-cover bg-center"
                style={{ backgroundImage: `url("${item.image_url}")` }}
              />
              <div className="space-y-1 px-4 py-4">
                <p className="line-clamp-2 text-sm font-medium">
                  {item.caption || "Studio Z Academy"}
                </p>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {item.category}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
