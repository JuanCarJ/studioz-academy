import { getContactInbox } from "@/actions/admin/operations"
import { OperationForm } from "@/components/admin/OperationForm"
import { AdminPagination } from "@/components/admin/AdminPagination"
import { Button } from "@/components/ui/button"
export const metadata = { title: "Mensajes — Studio Z" }
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const params = await searchParams
  const result = await getContactInbox(params.status, Number(params.page))
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Mensajes de contacto</h1>
      <form className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="contact-state" className="mb-1 block">
            Estado
          </label>
          <select
            id="contact-state"
            name="status"
            defaultValue={params.status ?? ""}
            className="h-11 rounded-md border bg-background px-3"
          >
            <option value="">Todos</option>
            <option value="new">Nuevos</option>
            <option value="in_progress">En gestión</option>
            <option value="resolved">Resueltos</option>
          </select>
        </div>
        <Button className="min-h-11">Filtrar</Button>
      </form>
      {result.error && <p role="alert">{result.error}</p>}
      {!result.error && !result.messages.length && (
        <p>No hay mensajes para este filtro.</p>
      )}
      {result.messages.map((m) => (
        <article key={m.id} className="space-y-4 rounded-xl border p-5">
          <div>
            <h2 className="text-lg font-semibold">
              {m.subject || "Consulta de Studio Z"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {m.name} · {new Date(m.created_at).toLocaleString("es-CO")}
            </p>
            <a className="underline" href={`mailto:${m.email}`}>
              Responder a {m.email}
            </a>
          </div>
          <p className="whitespace-pre-wrap break-words">{m.message}</p>
          <details>
            <summary className="min-h-11 cursor-pointer py-3 font-medium">
              Gestionar mensaje
            </summary>
            <OperationForm
              targetId={m.id}
              operations={[
                { value: "contact.update", label: "Actualizar atención" },
              ]}
              contactStatus={m.status}
              notes={m.notes}
            />
          </details>
        </article>
      ))}
      <AdminPagination
        page={result.page}
        totalCount={result.totalCount}
        pageSize={25}
      />
    </section>
  )
}
