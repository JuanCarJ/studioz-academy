import Image from "next/image"
import Link from "next/link"

import type { Metadata } from "next"

import {
  getHomePageData,
  type PublishedCoursePreview,
} from "@/actions/editorial"
import { CourseGrid } from "@/components/courses/CourseGrid"
import { ScrollReveal } from "@/components/motion/ScrollReveal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { isPromotionalFreeCourse } from "@/lib/pricing"
import { formatCOP } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Studio Z Academy",
  description:
    "Cursos online de baile y tatuaje con la identidad de Studio Z, mas noticias, eventos y comunidad.",
}

function formatEventDate(date: string) {
  return new Date(date).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function getGalleryItemAlt(input: {
  caption: string | null
  category: "baile" | "tatuaje"
}) {
  if (input.caption) return input.caption

  return input.category === "baile"
    ? "Momento de baile en Studio Z"
    : "Trabajo de tatuaje en Studio Z"
}

function FeaturedCourseSpotlight({
  course,
}: {
  course: PublishedCoursePreview | null
}) {
  if (!course) {
    return (
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardContent className="space-y-4 pt-6">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">
            Curso destacado de Studio Z Academy
          </p>
          <h2 className="text-2xl font-semibold">
            Estamos preparando nuevas rutas para el home.
          </h2>
          <p className="text-sm text-muted-foreground">
            Mientras curamos los destacados, puedes entrar al catalogo completo
            y explorar la oferta online de Studio Z.
          </p>
          <Button asChild>
            <Link href="/cursos">Ver catalogo</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const isPromoFree = isPromotionalFreeCourse({
    is_free: course.is_free,
    current_price: course.current_price,
    has_course_discount: course.has_course_discount,
  })

  return (
    <Card className="overflow-hidden border-white/10 bg-white/5 backdrop-blur">
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {course.thumbnail_url ? (
          <Image
            src={course.thumbnail_url}
            alt={course.title}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 36vw"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.3),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(0,0,0,0.2))] text-sm text-muted-foreground">
            Studio Z Academy
          </div>
        )}
      </div>

      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">
            Studio Z Academy
          </p>
          <Badge variant="secondary">
            {course.category === "baile" ? "Baile" : "Tatuaje"}
          </Badge>
          {course.isNew && (
            <Badge className="bg-blue-600 text-white hover:bg-blue-600">
              Nuevo
            </Badge>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">{course.title}</h2>
          <p className="text-sm text-muted-foreground">
            {course.short_description ||
              "Empieza esta ruta online con el sello de Studio Z."}
          </p>
        </div>

        {course.instructor && (
          <p className="text-sm text-muted-foreground">
            Con {course.instructor.full_name}
          </p>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {course.is_free ? (
              <p className="text-xl font-semibold text-green-600">Gratis</p>
            ) : isPromoFree ? (
              <>
                <p className="text-sm text-muted-foreground line-through">
                  {formatCOP(course.list_price)}
                </p>
                <p className="text-xl font-semibold text-amber-500">
                  Gratis por promo
                </p>
              </>
            ) : (
              <>
                {course.has_course_discount && (
                  <p className="text-sm text-muted-foreground line-through">
                    {formatCOP(course.list_price)}
                  </p>
                )}
                <p className="text-xl font-semibold">
                  {formatCOP(course.current_price)}
                </p>
              </>
            )}
          </div>

          <Button asChild>
            <Link href={`/cursos/${course.slug}`}>Ver curso</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CategoryShowcaseCard(input: {
  title: string
  eyebrow: string
  description: string
  href: string
  imageUrl: string | null
  imageAlt: string
}) {
  return (
    <Link href={input.href} className="group block h-full">
      <Card className="relative h-full min-h-[320px] overflow-hidden border-white/10 bg-black transition-transform duration-300 hover:-translate-y-1">
        {input.imageUrl ? (
          <Image
            src={input.imageUrl}
            alt={input.imageAlt}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 1024px) 100vw, 50vw"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.32),transparent_52%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.2),transparent_36%),linear-gradient(180deg,#1a1013,#080809)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" />

        <CardContent className="relative flex h-full flex-col justify-end p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">
            {input.eyebrow}
          </p>
          <h3 className="mt-3 text-3xl font-semibold text-white">
            {input.title}
          </h3>
          <p className="mt-3 max-w-lg text-sm text-white/78">
            {input.description}
          </p>
          <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-white">
            Explorar cursos
            <span aria-hidden="true">→</span>
          </span>
        </CardContent>
      </Card>
    </Link>
  )
}

export default async function HomePage() {
  const data = await getHomePageData()

  return (
    <div className="pb-16">
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.2),transparent_38%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.16),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]" />
        <div className="container relative mx-auto px-4 py-20 sm:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.2em] text-primary">
                Studio Z Academy
              </p>
              <h1 className="mt-5 text-5xl font-bold tracking-tight sm:text-6xl">
                Aprende baile y tatuaje online con el sello de Studio Z.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
                Explora cursos pensados para avanzar con técnica, criterio y
                una forma de enseñar que nace del estudio real.
              </p>

              <div className="mt-7 inline-flex max-w-full flex-wrap items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                <span>{data.publishedCoursesCount} cursos online disponibles</span>
              </div>

              <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href="/cursos">Explorar cursos</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto"
                >
                  <Link href="/servicios">Sobre Studio Z</Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="w-full sm:w-auto">
                  <Link href="/contacto">Hablar con Studio Z</Link>
                </Button>
              </div>
            </div>

            <FeaturedCourseSpotlight course={data.heroCourse} />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="home-categories-heading"
        className="container mx-auto px-4 py-14"
      >
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary">
              Empieza por aqui
            </p>
            <h2
              id="home-categories-heading"
              className="mt-2 text-3xl font-bold"
            >
              Elige tu camino: baile o tatuaje.
            </h2>
          </div>
          <Button asChild variant="ghost" className="w-full sm:w-auto">
            <Link href="/servicios">Conocer Studio Z</Link>
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ScrollReveal>
            <CategoryShowcaseCard
              title="Quiero aprender baile"
              eyebrow="Baile online"
              description="Desde salsa y bachata hasta ritmos urbanos, entra al catalogo online y encuentra la ruta que mejor va contigo."
              href="/cursos?category=baile"
              imageUrl={data.categoryShowcase.baile?.image_url ?? null}
              imageAlt={getGalleryItemAlt({
                caption: data.categoryShowcase.baile?.caption ?? null,
                category: "baile",
              })}
            />
          </ScrollReveal>
          <ScrollReveal>
            <CategoryShowcaseCard
              title="Quiero aprender tatuaje"
              eyebrow="Tatuaje online"
              description="Empieza con fundamentos, practica segura y criterio visual para avanzar con una base clara desde el primer modulo."
              href="/cursos?category=tatuaje"
              imageUrl={data.categoryShowcase.tatuaje?.image_url ?? null}
              imageAlt={getGalleryItemAlt({
                caption: data.categoryShowcase.tatuaje?.caption ?? null,
                category: "tatuaje",
              })}
            />
          </ScrollReveal>
        </div>
      </section>

      <section
        aria-labelledby="home-courses-heading"
        className="container mx-auto px-4 py-10"
      >
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary">
              Cursos destacados
            </p>
            <h2 id="home-courses-heading" className="mt-2 text-3xl font-bold">
              Cursos disponibles ahora
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Una seleccion curada para que encuentres rapido por donde empezar
              en Studio Z Academy.
            </p>
          </div>
          <Button asChild variant="ghost" className="w-full sm:w-auto">
            <Link href="/cursos">Ver catalogo completo</Link>
          </Button>
        </div>
        <CourseGrid courses={data.featuredCourses} />
      </section>

      <section
        aria-labelledby="home-gallery-heading"
        className="container mx-auto px-4 py-10"
      >
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary">
              Comunidad
            </p>
            <h2 id="home-gallery-heading" className="mt-2 text-3xl font-bold">
              Nuestra comunidad en accion
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Una muestra rapida del ritmo, la energia y el trabajo que se vive
              alrededor de Studio Z.
            </p>
          </div>
          <Button asChild variant="ghost" className="w-full sm:w-auto">
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
            <ScrollReveal key={item.id}>
              <Link
                href="/galeria"
                className="group block overflow-hidden rounded-3xl border border-white/10 transition-transform duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-muted">
                  <Image
                    src={item.image_url}
                    alt={getGalleryItemAlt({
                      caption: item.caption,
                      category: item.category,
                    })}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    unoptimized
                  />
                </div>
                <div className="space-y-1 px-4 py-4">
                  <p className="line-clamp-2 text-sm font-medium">
                    {item.caption || "Studio Z Academy"}
                  </p>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {item.category}
                  </p>
                </div>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="home-events-heading"
        className="container mx-auto px-4 py-10"
      >
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary">
              Eventos
            </p>
            <h2 id="home-events-heading" className="mt-2 text-3xl font-bold">
              Proximos eventos
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Encuentra la agenda abierta de Studio Z y mira lo que viene para
              la comunidad.
            </p>
          </div>
          <Button asChild variant="ghost" className="w-full sm:w-auto">
            <Link href="/eventos">Ver agenda</Link>
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {data.upcomingEvents.length === 0 && (
            <Card className="lg:col-span-3">
              <CardContent className="pt-6 text-muted-foreground">
                No hay eventos proximos publicados.
              </CardContent>
            </Card>
          )}

          {data.upcomingEvents.map((event) => (
            <ScrollReveal key={event.id}>
              <Link href="/eventos" className="group block h-full">
                <Card className="h-full overflow-hidden border-white/10 transition-transform duration-300 hover:-translate-y-1">
                  <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                    {event.image_url ? (
                      <Image
                        src={event.image_url}
                        alt={event.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 1024px) 100vw, 33vw"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.24),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.12))] text-sm text-muted-foreground">
                        Evento Studio Z
                      </div>
                    )}
                  </div>
                  <CardContent className="space-y-3 pt-6">
                    <p className="text-xs uppercase tracking-[0.2em] text-primary">
                      {formatEventDate(event.event_date)}
                    </p>
                    <h3 className="text-xl font-semibold">{event.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {event.description || "Evento publicado por Studio Z."}
                    </p>
                    {event.location && (
                      <p className="text-sm font-medium">{event.location}</p>
                    )}
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                      Ver agenda completa
                      <span aria-hidden="true">→</span>
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="home-news-heading"
        className="container mx-auto px-4 py-10"
      >
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary">
              Noticias
            </p>
            <h2 id="home-news-heading" className="mt-2 text-3xl font-bold">
              Lo ultimo de Studio Z
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Novedades, anuncios y contenido que acompana la vida de la
              academia y el estudio.
            </p>
          </div>
          <Button asChild variant="ghost" className="w-full sm:w-auto">
            <Link href="/noticias">Ir a noticias</Link>
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {data.latestPosts.length === 0 && (
            <Card className="lg:col-span-3">
              <CardContent className="pt-6 text-muted-foreground">
                No hay noticias publicadas por ahora.
              </CardContent>
            </Card>
          )}

          {data.latestPosts.map((post) => (
            <ScrollReveal key={post.id}>
              <Link href={`/noticias/${post.slug}`} className="group block h-full">
                <Card className="h-full overflow-hidden border-white/10 transition-transform duration-300 hover:-translate-y-1">
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    {post.cover_image_url ? (
                      <Image
                        src={post.cover_image_url}
                        alt={post.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 1024px) 100vw, 33vw"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.2),transparent_50%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.12))] text-sm text-muted-foreground">
                        Studio Z
                      </div>
                    )}
                  </div>
                  <CardContent className="space-y-3 pt-6">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
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
                    <h3 className="text-xl font-semibold">{post.title}</h3>
                    <p className="line-clamp-3 text-sm text-muted-foreground">
                      {post.excerpt || "Leer mas sobre esta publicacion."}
                    </p>
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                      Leer articulo
                      <span aria-hidden="true">→</span>
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="home-cta-heading"
        className="container mx-auto px-4 py-12"
      >
        <Card className="overflow-hidden border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.18),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]">
          <CardContent className="flex flex-col gap-8 pt-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.2em] text-primary">
                Studio Z Academy
              </p>
              <h2 id="home-cta-heading" className="mt-3 text-3xl font-bold">
                No es solo contenido.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Es una forma de aprender con el sello de Studio Z. Cada ruta
                esta pensada para ayudarte a desarrollar base, criterio y
                confianza. Elige formacion online si quieres empezar hoy, o
                conoce la experiencia presencial si buscas inmersion completa.
              </p>
            </div>

            <div className="grid gap-3 sm:flex sm:flex-wrap">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/cursos">Explorar cursos online</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full border-white/15 bg-black/40 text-white hover:bg-black/60 hover:text-white sm:w-auto"
              >
                <Link href="/servicios#about-studio-z-heading">Conoce mas sobre nosotros</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
