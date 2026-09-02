import { listAuditLogs } from "@/actions/admin/audit"
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, normalizeAuditFilters, pageQuery } from "@/lib/admin-review-audit"
import { StudentPagination } from "@/components/dashboard/StudentPagination"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export const metadata = { title: "Auditoría — Admin | Studio Z" }
type Query = Record<string, string | string[] | undefined>

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams
  const filters = normalizeAuditFilters(query)
  const result = await listAuditLogs(query)
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Auditoría</h1>
        <p className="mt-2 text-muted-foreground">Consulta quién realizó un cambio y revisa la información anterior y posterior.</p>
      </div>
      <form className="grid items-end gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-2 text-sm font-medium">Acción
          <select name="action" defaultValue={filters.action} className="min-h-11 w-full rounded-md border bg-background px-3">
            <option value="">Todas las acciones</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium">Administrador
          <Input name="admin" defaultValue={filters.admin} placeholder="Nombre del administrador" maxLength={120} />
        </label>
        <label className="space-y-2 text-sm font-medium">Área
          <select name="entityType" defaultValue={filters.entityType} className="min-h-11 w-full rounded-md border bg-background px-3">
            <option value="">Todas las áreas</option>
            {Object.entries(AUDIT_ENTITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium">Resultado
          <select name="result" defaultValue={filters.result} className="min-h-11 w-full rounded-md border bg-background px-3">
            <option value="">Todos los resultados</option><option value="success">Completado</option><option value="error">No completado</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium">Desde
          <Input type="date" name="dateFrom" defaultValue={filters.dateFrom} />
        </label>
        <label className="space-y-2 text-sm font-medium">Hasta
          <Input type="date" name="dateTo" defaultValue={filters.dateTo} />
        </label>
        <Button type="submit" className="min-h-11">Aplicar filtros</Button>
      </form>
      <p className="text-sm text-muted-foreground" role="status">{result.total} cambios encontrados</p>
      {result.items.length === 0
        ? <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No hay cambios registrados para estos filtros.</p>
        : <ol className="space-y-3">
          {result.items.map((log) => (
            <li key={log.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{AUDIT_ACTION_LABELS[log.action] ?? "Cambio administrativo"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{log.admin_name ?? "Administración"} · {AUDIT_ENTITY_LABELS[log.entity_type] ?? "Registro"}</p>
                </div>
                <div className="text-sm">
                  <p>{log.result === "success" ? "Completado" : "No completado"}</p>
                  <time className="text-xs text-muted-foreground" dateTime={log.created_at}>{new Date(log.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</time>
                </div>
              </div>
              <details className="mt-3">
                <summary className="w-fit cursor-pointer py-2 text-sm font-medium text-primary">Ver cambios y referencia</summary>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="font-medium">Acción registrada</dt><dd className="break-all">{log.action}</dd></div>
                  <div><dt className="font-medium">Referencia del registro</dt><dd className="break-all">{log.entity_id ?? "No aplica"}</dd></div>
                </dl>
                <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
                  <div className="min-w-0"><h3 className="text-sm font-medium">Antes</h3><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{JSON.stringify(log.before_data, null, 2)}</pre></div>
                  <div className="min-w-0"><h3 className="text-sm font-medium">Después</h3><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{JSON.stringify(log.after_data, null, 2)}</pre></div>
                </div>
                {log.metadata && <details className="mt-3"><summary className="cursor-pointer py-2 text-sm">Contexto adicional</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{JSON.stringify(log.metadata, null, 2)}</pre></details>}
              </details>
            </li>
          ))}
        </ol>}
      <StudentPagination pathname="/admin/auditoria" page={result.page} pageSize={result.pageSize} total={result.total} query={pageQuery(filters)} />
    </section>
  )
}
