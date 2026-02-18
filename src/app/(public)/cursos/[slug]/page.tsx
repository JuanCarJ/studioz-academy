export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <section className="container mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold">Detalle del curso</h1>
      <p className="mt-2 text-muted-foreground">Curso: {slug}</p>
    </section>
  )
}
