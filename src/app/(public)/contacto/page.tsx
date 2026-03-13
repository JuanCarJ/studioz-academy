import type { Metadata } from "next"
import { Instagram, MapPin, MessageCircle } from "lucide-react"

import { buildMapsUrl, buildWhatsAppUrl, studioZLines } from "@/content/studio-z"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Contacto — Studio Z Academy",
  description: "Canales directos y ubicaciones de Studio Z Dance y Studio Z Tattoo.",
}

export default function ContactoPage() {
  const locations = [studioZLines.dance, studioZLines.tattoo]
  const contactSummaries = {
    Baile: "Canales directos para clases, cursos y actividad de baile.",
    Tattoo: "Canales directos para proyectos, citas y actividad de tattoo.",
  } as const

  return (
    <main className="container mx-auto max-w-6xl space-y-10 px-4 py-16">
      <section aria-labelledby="contacto-heading" className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.18em] text-primary">
          Contacto
        </p>
        <h1
          id="contacto-heading"
          className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl"
        >
          Datos de contacto de Studio Z.
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          Aqui encuentras los accesos directos a WhatsApp, Instagram y de
          Studio Z. Espereamos tu mensaje!
        </p>
      </section>

      <section
        aria-labelledby="sedes-heading"
        className="space-y-6"
      >
        <h2 id="sedes-heading" className="sr-only">
          Sedes y canales de contacto
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {locations.map((location) => (
            <Card
              key={location.shortName}
              className="border-white/10 transition-colors hover:border-primary/25"
            >
              <CardContent className="space-y-6 pt-6">
                <div>
                <p className="text-xs uppercase tracking-[0.15em] text-primary">
                  {location.eyebrow}
                </p>
                <h2 className="mt-2 text-3xl font-semibold">{location.name}</h2>
                <p className="mt-3 leading-7 text-muted-foreground">
                  {contactSummaries[location.shortName]}
                </p>
              </div>

                <div className="rounded-3xl border border-white/10 bg-card/70 p-5">
                  <p className="text-xs uppercase tracking-[0.15em] text-primary">
                    Ubicacion
                  </p>
                  <address className="mt-3 not-italic text-sm text-muted-foreground">
                    {location.address}
                  </address>
                </div>

                <nav
                  aria-label={`Canales para ${location.name}`}
                  className="flex flex-wrap gap-3"
                >
                  <Button asChild>
                    <a
                      href={buildWhatsAppUrl(
                        location.whatsappNumber,
                        location.whatsappMessage
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir WhatsApp de ${location.name} (abre en una nueva ventana)`}
                    >
                      <MessageCircle className="mr-2 h-4 w-4" />
                      WhatsApp
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <a
                      href={location.instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir Instagram de ${location.name} (abre en una nueva ventana)`}
                    >
                      <Instagram className="mr-2 h-4 w-4" />
                      Instagram
                    </a>
                  </Button>
                  <Button asChild variant="ghost">
                    <a
                      href={buildMapsUrl(location.mapsQuery)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir Google Maps para ${location.name} (abre en una nueva ventana)`}
                    >
                      <MapPin className="mr-2 h-4 w-4" />
                      Abrir en Google Maps
                    </a>
                  </Button>
                </nav>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  )
}
