import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"

import type { Metadata } from "next"

import { getPostBySlug, getPublishedPosts } from "@/actions/editorial"
import { EventImageCarousel } from "@/components/events/EventImageCarousel"
import { Card, CardContent } from "@/components/ui/card"
import { createServerClient } from "@/lib/supabase/server"

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
    const supabase = await createServerClient()
    const { data: slugRedirect } = await supabase
      .from("slug_redirects")
      .select("new_slug")
      .eq("old_slug", slug)
      .eq("entity_type", "post")
      .maybeSingle()

    if (slugRedirect) {
      permanentRedirect(`/noticias/${slugRedirect.new_slug}`)
    }

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

        <div className="overflow-hidden rounded-3xl border">
          <EventImageCarousel
            images={post.images ?? []}
            title={post.title}
            aspectClassName="aspect-[16/9]"
            fallbackLabel="Noticia Studio Z"
          />
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
