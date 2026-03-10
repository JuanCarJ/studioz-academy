import {
  deleteEvent,
  getAdminEvents,
} from "@/actions/admin/editorial"
import { EventAdminForm } from "@/components/admin/EventAdminForm"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function AdminEventsPage() {
  const events = await getAdminEvents()

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Eventos</h1>
        <p className="mt-2 text-muted-foreground">
          Gestion de agenda publica y activaciones Studio Z.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo evento</CardTitle>
        </CardHeader>
        <CardContent>
          <EventAdminForm testId="event-create-form" />
        </CardContent>
      </Card>

      <div className="space-y-4">
        {events.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-muted-foreground">
              Aun no hay eventos creados.
            </CardContent>
          </Card>
        )}

        {events.map((event) => {
          const deleteAction = deleteEvent.bind(null, event.id)

          return (
            <Card key={event.id} data-testid={`event-card-${event.id}`}>
              <CardHeader className="gap-2">
                <CardTitle className="text-xl">{event.title}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {event.is_published ? "Publicado" : "Borrador"} ·{" "}
                  {new Date(event.event_date).toLocaleString("es-CO")}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {event.image_url && (
                  <div
                    className="h-48 rounded-2xl border bg-cover bg-center"
                    style={{ backgroundImage: `url("${event.image_url}")` }}
                  />
                )}

                <EventAdminForm
                  event={event}
                  testId={`event-update-form-${event.id}`}
                />

                <form action={deleteAction}>
                  <Button type="submit" variant="destructive">
                    Eliminar evento
                  </Button>
                </form>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
