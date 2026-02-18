export default async function CoursePlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <section>
      <h1 className="text-3xl font-bold">Reproductor del curso</h1>
      <p className="mt-2 text-muted-foreground">Curso: {slug}</p>
      {/* TODO: VideoPlayer + LessonList */}
    </section>
  )
}
