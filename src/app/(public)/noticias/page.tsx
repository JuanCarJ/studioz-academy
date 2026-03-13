import Link from "next/link"

import type { Metadata } from "next"

import { getPublishedPosts } from "@/actions/editorial"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Noticias — Studio Z Academy",
  description:
    "Novedades, anuncios, contenido de marca y publicaciones editoriales de Studio Z.",
}

export default async function NoticiasPage() {
  const posts = await getPublishedPosts()

  return (
    <section className="container mx-auto space-y-10 px-4 py-16">
      <div className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.36em] text-primary">
          Noticias
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Lo que se mueve en Studio Z.
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          Lanzamientos, novedades, aperturas, anuncios y contenido que
          mantiene cerca a la comunidad de Studio Z Academy, la academia de
          baile y el estudio.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {posts.length === 0 && (
          <Card className="lg:col-span-2">
            <CardContent className="pt-6 text-muted-foreground">
              Aun no hay noticias publicadas.
            </CardContent>
          </Card>
        )}

        {posts.map((post) => (
          <Link key={post.id} href={`/noticias/${post.slug}`} className="block">
            <Card className="h-full overflow-hidden border-white/10 transition-transform hover:-translate-y-1">
              <div
                className="aspect-[16/9] bg-cover bg-center"
                style={{
                  backgroundImage: post.cover_image_url
                    ? `url("${post.cover_image_url}")`
                    : undefined,
                }}
              >
                {!post.cover_image_url && (
                  <div className="flex h-full items-center justify-center bg-muted text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    Studio Z
                  </div>
                )}
              </div>
              <CardContent className="space-y-3 pt-6">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {post.published_at
                    ? new Date(post.published_at).toLocaleDateString("es-CO", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "Sin fecha"}
                </p>
                <h2 className="text-2xl font-semibold">{post.title}</h2>
                <p className="line-clamp-4 text-sm text-muted-foreground">
                  {post.excerpt || "Leer mas sobre esta publicacion."}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}
