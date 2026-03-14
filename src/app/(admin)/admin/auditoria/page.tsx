import { listAuditLogs } from "@/actions/admin/audit"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface PageProps {
  searchParams: Promise<{
    action?: string
    dateFrom?: string
  }>
}

export default async function AdminAuditPage({ searchParams }: PageProps) {
  const params = await searchParams
  const logs = await listAuditLogs({
    action: params.action || undefined,
    dateFrom: params.dateFrom || undefined,
  })

  const failures = logs.filter((log) => log.result === "failure").length
  const success = logs.filter((log) => log.result === "success").length

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Auditoria</h1>
        <p className="mt-2 text-muted-foreground">
          Consulta de acciones administrativas registradas por el sistema.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm text-muted-foreground">Eventos cargados</p>
            <p className="text-3xl font-bold">{logs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm text-muted-foreground">Exitos</p>
            <p className="text-3xl font-bold">{success}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm text-muted-foreground">Fallas</p>
            <p className="text-3xl font-bold">{failures}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <label htmlFor="action" className="text-sm font-medium">
                Accion
              </label>
              <Input
                id="action"
                name="action"
                defaultValue={params.action ?? ""}
                placeholder="combo.update, event.create..."
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="dateFrom" className="text-sm font-medium">
                Desde
              </label>
              <Input
                id="dateFrom"
                name="dateFrom"
                type="date"
                defaultValue={params.dateFrom ?? ""}
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Aplicar filtros
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registro</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Accion</TableHead>
                <TableHead>Entidad</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Entidad ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No hay registros para los filtros aplicados.
                  </TableCell>
                </TableRow>
              )}
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString("es-CO")}
                  </TableCell>
                  <TableCell className="font-medium">{log.action}</TableCell>
                  <TableCell>{log.entity_type}</TableCell>
                  <TableCell>
                    {log.result === "success" ? "success" : "failure"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.entity_id ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  )
}
