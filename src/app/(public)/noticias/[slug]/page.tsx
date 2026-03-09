import Link from "next/link"
import { notFound } from "next/navigation"

import type { Metadata } from "next"

import { getPostBySlug, getPublishedPosts } from "@/actions/editorial"
import { Card, CardContent } from "@/components/ui/card"

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)

  if (!post) {
    return { title: "Noticia no encontrada — Studio Z Academy" }
  }

  return {
    title: `${post.title} — Studio Z Academy`,
    description: post.excerpt || post.content?.slice(0, 160) || "",
  }
}

export default async function NoticiaDetailPage({ params }: PageProps) {
  const { slug } = await params
  const post = await getPostBySlug(slug)

  if (!post) {
    notFound()
  }

  const latestPosts = (await getPublishedPosts())
    .filter((item) => item.id !== post.id)
    .slice(0, 3)

  return (
    <section className="container mx-auto grid gap-12 px-4 py-16 lg:grid-cols-[minmax(0,1fr)_320px]">
      <article className="space-y-8">
        <div className="space-y-4">
          <Link
            href="/noticias"
            className="text-xs uppercase tracking-[0.3em] text-primary"
          >
            Volver a noticias
          </Link>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {post.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {post.published_at
              ? new Date(post.published_at).toLocaleDateString("es-CO", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "Publicacion sin fecha"}
          </p>
          {post.excerpt && (
            <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
              {post.excerpt}
            </p>
          )}
        </div>

        <div
          className="aspect-[16/9] rounded-3xl border bg-cover bg-center"
          style={{
            backgroundImage: post.cover_image_url
              ? `url("${post.cover_image_url}")`
              : undefined,
          }}
        >
          {!post.cover_image_url && (
            <div className="flex h-full items-center justify-center rounded-3xl bg-muted text-sm uppercase tracking-[0.24em] text-muted-foreground">
              Studio Z Academy
            </div>
          )}
        </div>

        <div className="space-y-5 text-base leading-8 text-muted-foreground">
          {(post.content || "")
            .split("\n")
            .filter((paragraph) => paragraph.trim().length > 0)
            .map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
        </div>
      </article>

      <aside className="space-y-4">
        <Card className="border-white/10">
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-xl font-semibold">Mas publicaciones</h2>
            {latestPosts.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hay mas noticias publicadas por ahora.
              </p>
            )}
            {latestPosts.map((item) => (
              <Link
                key={item.id}
                href={`/noticias/${item.slug}`}
                className="block rounded-2xl border p-4 transition-colors hover:border-primary/40"
              >
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {item.excerpt || "Leer mas"}
                </p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </aside>
    </section>
  )
}
