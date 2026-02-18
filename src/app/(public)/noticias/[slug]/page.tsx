export default async function NoticiaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <section className="container mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold">Noticia</h1>
      <p className="mt-2 text-muted-foreground">Noticia: {slug}</p>
    </section>
  )
}
