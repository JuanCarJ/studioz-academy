import {
  createNews,
  deleteNews,
  getAdminPosts,
  updateNews,
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

export default async function AdminNewsPage() {
  const posts = await getAdminPosts()

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Noticias</h1>
        <p className="mt-2 text-muted-foreground">
          CRUD editorial para el listado publico de noticias.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva noticia</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createNews} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="create-title" className="text-sm font-medium">
                  Titulo
                </label>
                <Input id="create-title" name="title" required />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="create-excerpt"
                  className="text-sm font-medium"
                >
                  Extracto
                </label>
                <Input id="create-excerpt" name="excerpt" />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="create-cover-url"
                  className="text-sm font-medium"
                >
                  URL imagen de portada
                </label>
                <Input id="create-cover-url" name="coverImageUrl" />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="create-cover-file"
                  className="text-sm font-medium"
                >
                  Archivo de portada
                </label>
                <Input
                  id="create-cover-file"
                  name="coverImage"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="create-content" className="text-sm font-medium">
                Contenido
              </label>
              <Textarea
                id="create-content"
                name="content"
                className="min-h-40"
                required
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isPublished" className="h-4 w-4" />
              Publicar de inmediato
            </label>

            <Button type="submit">Crear noticia</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {posts.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-muted-foreground">
              Aun no hay noticias creadas.
            </CardContent>
          </Card>
        )}

        {posts.map((post) => {
          const updateAction = updateNews.bind(null, post.id)
          const deleteAction = deleteNews.bind(null, post.id)

          return (
            <Card key={post.id}>
              <CardHeader className="gap-2">
                <CardTitle className="text-xl">{post.title}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  /noticias/{post.slug} ·{" "}
                  {post.is_published ? "Publicado" : "Borrador"}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {post.cover_image_url && (
                  <div
                    className="h-48 rounded-2xl border bg-cover bg-center"
                    style={{ backgroundImage: `url("${post.cover_image_url}")` }}
                  />
                )}

                <form action={updateAction} className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Titulo</label>
                      <Input name="title" defaultValue={post.title} required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Extracto</label>
                      <Input
                        name="excerpt"
                        defaultValue={post.excerpt ?? ""}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        URL imagen de portada
                      </label>
                      <Input
                        name="coverImageUrl"
                        defaultValue={post.cover_image_url ?? ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Reemplazar imagen
                      </label>
                      <Input
                        name="coverImage"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Contenido</label>
                    <Textarea
                      name="content"
                      defaultValue={post.content ?? ""}
                      className="min-h-40"
                      required
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="isPublished"
                      defaultChecked={post.is_published}
                      className="h-4 w-4"
                    />
                    Publicado
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <Button type="submit">Guardar cambios</Button>
                  </div>
                </form>

                <form action={deleteAction}>
                  <Button type="submit" variant="destructive">
                    Eliminar noticia
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
