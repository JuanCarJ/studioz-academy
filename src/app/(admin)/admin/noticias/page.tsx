import { deleteNews, getAdminPosts } from "@/actions/admin/editorial"
import { NewsAdminForm } from "@/components/admin/NewsAdminForm"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function AdminNewsPage() {
  const posts = await getAdminPosts()

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Noticias</h1>
        <p className="mt-2 text-muted-foreground">
          Publica noticias con imagenes, contenido simple y reflejo inmediato en
          el sitio publico.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva noticia</CardTitle>
        </CardHeader>
        <CardContent>
          <NewsAdminForm testId="news-create-form" />
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
          const deleteAction = deleteNews.bind(null, post.id)

          return (
            <Card key={post.id} data-testid={`news-card-${post.id}`}>
              <CardHeader className="gap-2">
                <CardTitle className="text-xl">{post.title}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  /noticias/{post.slug} · Publicado
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {post.cover_image_url && (
                  <div
                    className="h-48 rounded-2xl border bg-cover bg-center"
                    style={{ backgroundImage: `url("${post.cover_image_url}")` }}
                  />
                )}

                <NewsAdminForm
                  post={post}
                  testId={`news-update-form-${post.id}`}
                />

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
