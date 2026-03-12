import Image from "next/image"
import Link from "next/link"

import type { Metadata } from "next"
import { ArrowRight, Instagram, MapPin, MessageCircle } from "lucide-react"

import { getGalleryItems } from "@/actions/editorial"
import {
  buildMapsUrl,
  buildWhatsAppUrl,
  danceCoursesOpen,
  studioZLines,
} from "@/content/studio-z"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Sobre Studio Z — Studio Z Academy",
  description:
    "Conoce la academia de baile y el estudio de tattoo que dan forma a Studio Z.",
}

function previewAltText(
  caption: string | null,
  fallback: string,
  category: string
) {
  return caption?.trim() || `${fallback} en la galeria de ${category}`
}

export default async function ServiciosPage() {
  const galleryItems = await getGalleryItems()
  const danceGallery = galleryItems
    .filter((item) => item.category === "baile")
    .slice(0, 3)
  const tattooGallery = galleryItems
    .filter((item) => item.category === "tatuaje")
    .slice(0, 3)

  const sections = [
    { ...studioZLines.dance, gallery: danceGallery },
    { ...studioZLines.tattoo, gallery: tattooGallery },
  ]

  return (
    <main className="container mx-auto space-y-16 px-4 py-16">
      <section
        aria-labelledby="about-studio-z-heading"
        className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-primary/15 via-background to-background px-6 py-12 sm:px-10"
      >
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_65%)] lg:block" />
        <div className="relative max-w-3xl">
          <p className="text-xs uppercase tracking-[0.18em] text-primary">
            Sobre Studio Z
          </p>
          <h1
            id="about-studio-z-heading"
            className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl"
          >
            Baile y tattoo con una identidad propia en Rionegro.
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Studio Z une una academia de baile y un estudio de tattoo bajo una
            misma marca: movimiento, criterio y presencia. Este espacio es para
            conocer como se vive cada linea y hablar directo con el equipo
            correcto.
          </p>
          <nav
            aria-label="Secciones de Sobre Studio Z"
            className="mt-8 flex flex-wrap gap-3"
          >
            <Button asChild size="lg">
              <Link href="#baile">Explorar baile</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#tattoo">Explorar tattoo</Link>
            </Button>
          </nav>
        </div>
      </section>

      <section
        aria-labelledby="studio-z-overview-heading"
        className="space-y-5"
      >
        <h2 id="studio-z-overview-heading" className="sr-only">
          Resumen de las lineas Studio Z
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="border-white/10 bg-card/70 transition-colors hover:border-primary/25">
            <CardContent className="space-y-3 pt-6">
              <p className="text-xs uppercase tracking-[0.15em] text-primary">
                Academia
              </p>
              <h3 className="text-2xl font-semibold">Baile con ruta clara</h3>
              <p className="text-sm text-muted-foreground">
                Entrenamiento para empezar, avanzar y sostener proceso con una
                energia real de estudio.
              </p>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-card/70 transition-colors hover:border-primary/25">
            <CardContent className="space-y-3 pt-6">
              <p className="text-xs uppercase tracking-[0.15em] text-primary">
                Estudio
              </p>
              <h3 className="text-2xl font-semibold">Tattoo como proyecto</h3>
              <p className="text-sm text-muted-foreground">
                Cada pieza se conversa, se aterriza y se ejecuta con criterio
                para que tenga peso visual y sentido.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {sections.map((section) => {
        const sectionId = section.shortName.toLowerCase()
        const headingId = `${sectionId}-heading`
        const actionsLabel = `Acciones para ${section.name}`
        const primaryCta =
          section.shortName === "Baile"
            ? "Quieres unirte a nuestros cursos? Contactanos"
            : "Tienes un proyecto que quieres plasmar? Hablemos"

        return (
          <section
            key={section.shortName}
            id={sectionId}
            aria-labelledby={headingId}
          >
            <Card className="overflow-hidden border-white/10">
              <CardContent className="grid gap-10 px-6 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
                <div className="space-y-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.15em] text-primary">
                      {section.eyebrow}
                    </p>
                    <h2
                      id={headingId}
                      className="mt-3 text-3xl font-semibold sm:text-4xl"
                    >
                      {section.shortName}
                    </h2>
                    <p className="mt-4 text-base leading-7 text-muted-foreground">
                      {section.intro}
                    </p>
                  </div>

                  <div className="space-y-3 text-sm leading-7 text-muted-foreground">
                    {section.details.map((detail) => (
                      <p key={detail}>{detail}</p>
                    ))}
                    <p className="font-medium text-foreground">
                      {section.audience}
                    </p>
                  </div>

                  {section.shortName === "Baile" && (
                    <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5">
                      <p className="text-xs uppercase tracking-[0.15em] text-primary">
                        Cursos abiertos
                      </p>
                      <h3 className="mt-2 text-xl font-semibold">
                        Estas son las lineas activas ahora mismo.
                      </h3>
                      <ul className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                        {danceCoursesOpen.map((course) => (
                          <li
                            key={course}
                            className="rounded-2xl border border-white/10 px-3 py-2"
                          >
                            {course}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-4 text-sm text-muted-foreground">
                        Los horarios se comparten directamente por WhatsApp para
                        orientarte segun nivel y disponibilidad.
                      </p>
                    </div>
                  )}

                  <nav
                    aria-label={actionsLabel}
                    className="flex flex-wrap gap-3"
                  >
                    <Button asChild size="lg">
                      <a
                        href={buildWhatsAppUrl(
                          section.whatsappNumber,
                          section.whatsappMessage
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${primaryCta} por WhatsApp (abre en una nueva ventana)`}
                      >
                        <MessageCircle className="mr-2 h-4 w-4" />
                        {primaryCta}
                      </a>
                    </Button>
                    <Button asChild size="lg" variant="outline">
                      <a
                        href={section.instagramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Ver Instagram de ${section.name} (abre en una nueva ventana)`}
                      >
                        <Instagram className="mr-2 h-4 w-4" />
                        Ver Instagram
                      </a>
                    </Button>
                    <Button asChild size="lg" variant="ghost">
                      <a
                        href={buildMapsUrl(section.mapsQuery)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Ver ubicacion de ${section.name} en Google Maps (abre en una nueva ventana)`}
                      >
                        <MapPin className="mr-2 h-4 w-4" />
                        Ver ubicacion
                      </a>
                    </Button>
                  </nav>
                </div>

                <div className="space-y-5">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.15em] text-primary">
                        Galeria
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold">
                        Un vistazo a {section.shortName.toLowerCase()}.
                      </h3>
                    </div>
                    <Button asChild variant="ghost" className="shrink-0">
                      <Link href="/galeria">
                        Ver galeria
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>

                  {section.gallery.length === 0 ? (
                    <div className="rounded-[2rem] border border-dashed px-6 py-16 text-center text-muted-foreground">
                      Aun no hay imagenes publicadas para esta linea.
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-3">
                      {section.gallery.map((item, index) => (
                        <figure
                          key={item.id}
                          className={
                            index === 0 ? "sm:col-span-2 sm:row-span-2" : ""
                          }
                        >
                          <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] border border-white/10">
                            <Image
                              src={item.image_url}
                              alt={previewAltText(
                                item.caption,
                                `${section.shortName} Studio Z`,
                                section.shortName.toLowerCase()
                              )}
                              fill
                              sizes={
                                index === 0
                                  ? "(min-width: 640px) 40vw, 100vw"
                                  : "(min-width: 640px) 18vw, 100vw"
                              }
                              className="object-cover"
                            />
                          </div>
                          <figcaption className="mt-3 text-sm text-muted-foreground">
                            {item.caption || `${section.shortName} Studio Z`}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}

                  <div className="rounded-3xl border border-white/10 bg-card/70 p-5">
                    <p className="text-sm text-muted-foreground">{section.name}</p>
                    <address className="mt-1 not-italic text-sm text-muted-foreground">
                      {section.address}
                    </address>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )
      })}

      <section aria-labelledby="next-step-heading">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col gap-4 pt-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.15em] text-primary">
                Siguiente paso
              </p>
              <h2 id="next-step-heading" className="mt-2 text-2xl font-semibold">
                Si ya sabes que linea te llama, habla con el equipo correcto.
              </h2>
              <p className="mt-2 text-muted-foreground">
                Tambien puedes revisar la pagina de contacto para ver ambas sedes
                y abrir la ruta directa en Google Maps.
              </p>
            </div>
            <nav
              aria-label="Acciones finales de Sobre Studio Z"
              className="flex flex-wrap gap-3"
            >
              <Button asChild>
                <Link href="/contacto">Ir a contacto</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/galeria">Ver galeria completa</Link>
              </Button>
            </nav>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
