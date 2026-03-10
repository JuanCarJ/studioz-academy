import {
  deleteGalleryImage,
  getAdminGalleryItems,
} from "@/actions/admin/editorial"
import { GalleryAdminForm } from "@/components/admin/GalleryAdminForm"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function AdminGalleryPage() {
  const items = await getAdminGalleryItems()

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Galeria</h1>
        <p className="mt-2 text-muted-foreground">
          Gestion de imagenes publicas por categoria y nombre.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva imagen</CardTitle>
        </CardHeader>
        <CardContent>
          <GalleryAdminForm testId="gallery-create-form" />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {items.length === 0 && (
          <Card className="xl:col-span-2">
            <CardContent className="pt-6 text-muted-foreground">
              Aun no hay imagenes en galeria.
            </CardContent>
          </Card>
        )}

        {items.map((item) => {
          const deleteAction = deleteGalleryImage.bind(null, item.id)

          return (
            <Card key={item.id} data-testid={`gallery-card-${item.id}`}>
              <CardHeader className="gap-2">
                <CardTitle className="text-xl">
                  {item.caption || "Imagen sin nombre"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {item.category}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className="h-56 rounded-2xl border bg-cover bg-center"
                  style={{ backgroundImage: `url("${item.image_url}")` }}
                />

                <GalleryAdminForm
                  item={item}
                  testId={`gallery-update-form-${item.id}`}
                />

                <form action={deleteAction}>
                  <Button type="submit" variant="destructive">
                    Eliminar imagen
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
