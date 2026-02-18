export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <section>
      <h1 className="text-3xl font-bold">Editar curso</h1>
      <p className="mt-2 text-muted-foreground">ID: {id}</p>
    </section>
  )
}
