import Link from "next/link"
import { getMediaQueue } from "@/actions/admin/operations"
import { MediaRetryButton } from "@/components/admin/MediaRetryButton"
export const metadata = { title: "Videos pendientes — Studio Z" }
export default async function MediaPage() {
  const queue = await getMediaQueue()
  if (!queue) return <p>No tienes permiso para consultar esta página.</p>
  return <section className="space-y-6"><h1 className="text-3xl font-bold">Videos pendientes</h1><p className="text-muted-foreground">Abre el curso para revisar la carga o volver a intentarla.</p>
    {queue.error && <p role="alert">No pudimos cargar toda la información. Intenta actualizar la página.</p>}
    {!queue.lessons.length && !queue.courses.length && !queue.error && <p>No hay videos que necesiten atención.</p>}
    <ul className="space-y-3">{queue.courses.map(c => <li className="rounded-lg border p-4" key={c.id}><Link className="font-medium underline" href={`/admin/cursos/${c.id}/editar`}>{c.title} · Vista previa</Link><p>{c.preview_upload_error ? "La carga necesita revisión." : "El video se está preparando."}</p><MediaRetryButton courseId={c.id} /></li>)}{queue.lessons.map(l => <li className="rounded-lg border p-4" key={l.id}><Link className="font-medium underline" href={`/admin/cursos/${l.course_id}/editar`}>{l.title}</Link><p>{l.video_upload_error ? "La carga necesita revisión." : "El video se está preparando."}</p><MediaRetryButton courseId={l.course_id} /></li>)}</ul>
    {queue.deferredCount > 0 && <aside className="rounded-lg border p-4"><h2 className="font-semibold">Archivos conservados por seguridad</h2><p>{queue.deferredCount} archivos antiguos esperan una revisión antes de eliminarlos. No afectan el acceso a las clases.</p></aside>}
  </section>
}
