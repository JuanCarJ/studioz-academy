"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCOP } from "@/lib/utils"

import type { UserDetail } from "@/actions/admin/users"

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  declined: "Rechazada",
  voided: "Anulada",
  refunded: "Reembolsada",
  chargeback: "Contracargo",
}

const ORDER_STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  approved: "default",
  declined: "destructive",
  voided: "outline",
  refunded: "outline",
  chargeback: "destructive",
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface UserDetailTabsProps {
  detail: UserDetail
}

export function UserDetailTabs({ detail }: UserDetailTabsProps) {
  const { profile, orders, enrollments, cartItems } = detail

  return (
    <Tabs defaultValue="datos">
      <TabsList className="mb-6">
        <TabsTrigger value="datos">Datos</TabsTrigger>
        <TabsTrigger value="ordenes">
          Ordenes{orders.length > 0 ? ` (${orders.length})` : ""}
        </TabsTrigger>
        <TabsTrigger value="cursos">
          Cursos{enrollments.length > 0 ? ` (${enrollments.length})` : ""}
        </TabsTrigger>
        <TabsTrigger value="carrito">
          Carrito{cartItems.length > 0 ? ` (${cartItems.length})` : ""}
        </TabsTrigger>
      </TabsList>

      {/* ── Datos ──────────────────────────────────── */}
      <TabsContent value="datos">
        <div className="max-w-lg space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Nombre completo</p>
              <p className="font-medium">{profile.full_name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{profile.email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Telefono</p>
              <p className="font-medium">{profile.phone ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rol</p>
              <Badge variant={profile.role === "admin" ? "default" : "secondary"}>
                {profile.role === "admin" ? "Admin" : "Usuario"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Fecha de registro</p>
              <p className="font-medium">{formatDate(profile.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ultimo ingreso</p>
              <p className="font-medium">{formatDateTime(profile.last_login_at)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Notificaciones por email
              </p>
              <p className="font-medium">
                {profile.email_notifications ? "Activadas" : "Desactivadas"}
              </p>
            </div>
          </div>
        </div>
      </TabsContent>

      {/* ── Ordenes ────────────────────────────────── */}
      <TabsContent value="ordenes">
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este usuario no tiene ordenes registradas.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Cursos</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-sm">
                    {order.reference}
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCOP(order.total)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        ORDER_STATUS_VARIANTS[order.status] ?? "secondary"
                      }
                    >
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {order.items.length > 0
                      ? order.items
                          .map((i) => i.course_title_snapshot)
                          .join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(order.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TabsContent>

      {/* ── Cursos ─────────────────────────────────── */}
      <TabsContent value="cursos">
        {enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este usuario no esta inscrito en ningun curso.
          </p>
        ) : (
          <div className="space-y-4">
            {enrollments.map((enrollment) => {
              const totalLessons = enrollment.total_lessons
              const completedLessons =
                enrollment.progress?.completed_lessons ?? 0
              const percentage =
                totalLessons > 0
                  ? Math.min(
                      100,
                      Math.round((completedLessons / totalLessons) * 100)
                    )
                  : 0

              return (
                <div key={enrollment.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium">
                        {enrollment.course?.title ?? enrollment.course_id}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Inscrito el {formatDate(enrollment.enrolled_at)}
                      </p>
                    </div>
                    {enrollment.progress?.is_completed && (
                      <Badge variant="default">Completado</Badge>
                    )}
                  </div>

                  {totalLessons > 0 && (
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          {completedLessons} de {totalLessons} lecciones
                        </span>
                        <span>{percentage}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {enrollment.progress?.last_accessed_at && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Ultimo acceso:{" "}
                      {formatDateTime(enrollment.progress.last_accessed_at)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </TabsContent>

      {/* ── Carrito ────────────────────────────────── */}
      <TabsContent value="carrito">
        {cartItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            El carrito de este usuario esta vacio.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Curso</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Agregado el</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cartItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.course?.title ?? item.course_id}
                  </TableCell>
                  <TableCell>
                    {item.course ? formatCOP(item.course.price) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(item.added_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TabsContent>
    </Tabs>
  )
}
