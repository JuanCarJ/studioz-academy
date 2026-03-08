import {
  createEvent,
  deleteEvent,
  getAdminEvents,
  updateEvent,
} from "@/actions/admin/editorial"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

function toDatetimeLocal(value: string) {
  return new Date(value).toISOString().slice(0, 16)
}

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
          <form action={createEvent} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Titulo</label>
                <Input name="title" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Fecha y hora</label>
                <Input name="eventDate" type="datetime-local" required />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Ubicacion</label>
                <Input name="location" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">URL imagen</label>
                <Input name="imageUrl" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Archivo imagen</label>
              <Input
                name="image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Descripcion</label>
              <Textarea name="description" className="min-h-32" />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isPublished" className="h-4 w-4" />
              Publicar de inmediato
            </label>

            <Button type="submit">Crear evento</Button>
          </form>
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
          const updateAction = updateEvent.bind(null, event.id)
          const deleteAction = deleteEvent.bind(null, event.id)

          return (
            <Card key={event.id}>
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

                <form action={updateAction} className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Titulo</label>
                      <Input name="title" defaultValue={event.title} required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Fecha y hora</label>
                      <Input
                        name="eventDate"
                        type="datetime-local"
                        defaultValue={toDatetimeLocal(event.event_date)}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Ubicacion</label>
                      <Input
                        name="location"
                        defaultValue={event.location ?? ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">URL imagen</label>
                      <Input
                        name="imageUrl"
                        defaultValue={event.image_url ?? ""}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Reemplazar imagen
                    </label>
                    <Input
                      name="image"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Descripcion</label>
                    <Textarea
                      name="description"
                      defaultValue={event.description ?? ""}
                      className="min-h-32"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="isPublished"
                      defaultChecked={event.is_published}
                      className="h-4 w-4"
                    />
                    Publicado
                  </label>

                  <Button type="submit">Guardar cambios</Button>
                </form>

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
