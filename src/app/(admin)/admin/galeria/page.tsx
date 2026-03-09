import {
  createGalleryImage,
  deleteGalleryImage,
  getAdminGalleryItems,
  updateGalleryImage,
} from "@/actions/admin/editorial"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const selectClassName =
  "border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"

export default async function AdminGalleryPage() {
  const items = await getAdminGalleryItems()

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Galeria</h1>
        <p className="mt-2 text-muted-foreground">
          Gestion de imagenes publicas por categoria y orden visual.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva imagen</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createGalleryImage} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Caption</label>
                <Input name="caption" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Orden</label>
                <Input name="sortOrder" type="number" min="0" defaultValue="0" />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Categoria</label>
                <select name="category" className={selectClassName} defaultValue="baile">
                  <option value="baile">Baile</option>
                  <option value="tatuaje">Tatuaje</option>
                </select>
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

            <Button type="submit">Crear imagen</Button>
          </form>
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
          const updateAction = updateGalleryImage.bind(null, item.id)
          const deleteAction = deleteGalleryImage.bind(null, item.id)

          return (
            <Card key={item.id}>
              <CardHeader className="gap-2">
                <CardTitle className="text-xl">
                  {item.caption || "Imagen sin caption"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {item.category} · orden {item.sort_order}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className="h-56 rounded-2xl border bg-cover bg-center"
                  style={{ backgroundImage: `url("${item.image_url}")` }}
                />

                <form action={updateAction} className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Caption</label>
                      <Input name="caption" defaultValue={item.caption ?? ""} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Orden</label>
                      <Input
                        name="sortOrder"
                        type="number"
                        min="0"
                        defaultValue={String(item.sort_order)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Categoria</label>
                      <select
                        name="category"
                        className={selectClassName}
                        defaultValue={item.category}
                      >
                        <option value="baile">Baile</option>
                        <option value="tatuaje">Tatuaje</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">URL imagen</label>
                      <Input name="imageUrl" defaultValue={item.image_url} />
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

                  <Button type="submit">Guardar cambios</Button>
                </form>

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
