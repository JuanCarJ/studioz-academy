import type { Metadata } from "next"

import { getPublishedEventsTimeline } from "@/actions/editorial"
import { EventImageCarousel } from "@/components/events/EventImageCarousel"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Eventos — Studio Z Academy",
  description:
    "Consulta los proximos eventos, workshops y activaciones de Studio Z.",
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default async function EventosPage() {
  const { upcoming, past } = await getPublishedEventsTimeline()

  return (
    <section className="container mx-auto space-y-12 px-4 py-16">
      <div className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.36em] text-primary">
          Eventos
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Encuentros, clases y activaciones para vivir Studio Z de cerca.
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          Consulta la agenda de Studio Z y encuentra proximos encuentros,
          workshops, activaciones y experiencias pensadas para conectar con la
          comunidad y mover la marca fuera de la pantalla.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <h2 className="text-2xl font-semibold">Proximos eventos</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Lo que viene en la agenda de Studio Z.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {upcoming.length === 0 && (
            <Card className="lg:col-span-2">
              <CardContent className="pt-6 text-muted-foreground">
                No hay eventos proximos publicados.
              </CardContent>
            </Card>
          )}
          {upcoming.map((event) => (
            <Card key={event.id} className="overflow-hidden border-white/10">
              <EventImageCarousel
                images={event.images ?? []}
                title={event.title}
              />
              <CardContent className="space-y-3 pt-6">
                <p className="text-xs uppercase tracking-[0.24em] text-primary">
                  {formatDateTime(event.event_date)}
                </p>
                <h3 className="text-2xl font-semibold">{event.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {event.description || "Evento publicado por Studio Z."}
                </p>
                {event.location && (
                  <p className="text-sm font-medium">{event.location}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <h2 className="text-2xl font-semibold">Eventos pasados</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Momentos que ya hicieron parte del recorrido.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {past.length === 0 && (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="pt-6 text-muted-foreground">
                Aun no hay eventos pasados registrados.
              </CardContent>
            </Card>
          )}
          {past.map((event) => (
            <Card key={event.id} className="overflow-hidden border-white/10">
              <EventImageCarousel
                images={event.images ?? []}
                title={event.title}
                aspectClassName="aspect-[4/3]"
              />
              <CardContent className="space-y-3 pt-6">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {formatDateTime(event.event_date)}
                </p>
                <h3 className="text-xl font-semibold">{event.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {event.location || "Sin ubicacion publicada"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
