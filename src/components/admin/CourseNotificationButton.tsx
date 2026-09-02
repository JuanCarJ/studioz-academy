"use client"
import { useActionState, useState } from "react"
import { sendNewCourseEmail } from "@/actions/admin/notifications"
import { Button } from "@/components/ui/button"
import type { CourseNotificationStats } from "@/lib/course-notifications"

export function CourseNotificationButton({ courseId, lessons, stats }: {
  courseId: string; lessons: Array<{ id: string; title: string }>; stats: CourseNotificationStats[]
}) {
  const [state, action, pending] = useActionState(sendNewCourseEmail, {})
  const [lessonId, setLessonId] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  return <section className="space-y-4">
    <h2 className="text-xl font-semibold">Avisar a los estudiantes</h2>
    <form action={action} className="space-y-3">
      <input type="hidden" name="courseId" value={courseId} />
      <label className="block space-y-1"><span className="text-sm font-medium">Anuncio</span>
        <select name="lessonId" value={lessonId} onChange={(event) => { setLessonId(event.target.value); setConfirmed(false) }}
          className="block w-full rounded-md border bg-background p-2 text-sm">
          <option value="">Nuevo curso</option>
          {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>Nueva lección: {lesson.title}</option>)}
        </select>
      </label>
      <p className="text-sm text-muted-foreground">{lessonId
        ? "Se avisará solo a estudiantes inscritos en este curso que aceptan novedades por correo."
        : "Se avisará a estudiantes que aceptan novedades por correo. Cada curso o lección se anuncia una sola vez."}</p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmed" value="yes" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />
        Confirmo que el contenido está listo y quiero programar este anuncio.
      </label>
      <Button type="submit" disabled={pending || !confirmed}>{pending ? "Programando…" : "Programar anuncio"}</Button>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-muted-foreground">{state.success}</p>}
    </form>
    {stats.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <caption className="mb-2 text-left text-muted-foreground">Avance de los anuncios. Actualiza la página para consultar cambios; el envío no confirma entrega en la bandeja.</caption>
      <thead><tr>{["Anuncio", "Destinatarios", "Enviados", "Omitidos", "Pendientes", "Fallidos"].map((title) => <th key={title} scope="col" className="p-2">{title}</th>)}</tr></thead>
      <tbody>{stats.map((campaign) => <tr key={campaign.id}>
        <th scope="row" className="p-2 font-normal">{campaign.kind === "course" ? "Nuevo curso" : `Nueva lección: ${campaign.description}`}{!campaign.audience_complete && " · Preparando destinatarios"}</th>
        <td className="p-2">{campaign.scheduled}</td><td className="p-2">{campaign.sent}</td>
        <td className="p-2">{campaign.skipped}</td><td className="p-2">{campaign.pending}</td><td className="p-2">{campaign.failed}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>
}
