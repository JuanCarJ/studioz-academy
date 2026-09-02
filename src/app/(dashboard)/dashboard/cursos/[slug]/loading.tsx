export default function CourseLoading() {
  return (
    <section role="status" aria-label="Cargando tu curso" className="space-y-5">
      <div className="h-8 w-2/3 animate-pulse rounded bg-muted" aria-hidden="true" />
      <div className="grid gap-6 lg:grid-cols-3" aria-hidden="true">
        <div className="aspect-video animate-pulse rounded-xl bg-muted lg:col-span-2" />
        <div className="hidden animate-pulse rounded-xl bg-muted lg:block" />
      </div>
      <p className="text-sm text-muted-foreground">Cargando tu curso…</p>
    </section>
  )
}
