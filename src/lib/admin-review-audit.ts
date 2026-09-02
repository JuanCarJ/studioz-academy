import { normalizePage } from "@/lib/admin-operations"

export const ADMIN_HISTORY_PAGE_SIZE = 25
type Query = Record<string, string | string[] | undefined>
const text = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 120) : ""

export function normalizeReviewFilters(query: Query = {}) {
  const visibility = text(query.visibility)
  const rating = Number(text(query.rating))
  return {
    search: text(query.search), course: text(query.course),
    visibility: visibility === "visible" || visibility === "hidden" ? visibility : "",
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    page: normalizePage(query.page),
  }
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "combo.create": "Crear combo", "combo.update": "Editar combo", "combo.delete": "Eliminar combo",
  "event.create": "Crear evento", "event.update": "Editar evento", "event.delete": "Eliminar evento",
  "gallery.create": "Añadir imagen", "gallery.update": "Editar imagen", "gallery.delete": "Eliminar imagen",
  "course.archive": "Archivar curso", "course.restore": "Restaurar curso",
  "contact.update": "Atender contacto", "user.note": "Añadir nota de soporte",
  "user.suspend": "Suspender cuenta", "user.resume": "Reactivar cuenta",
  "user.auth_cleanup": "Solicitar finalización de eliminación",
  "access.restore": "Restaurar acceso", "access.revoke": "Retirar acceso", "progress.reset": "Reiniciar progreso",
  "review.show": "Mostrar reseña", "review.hide": "Ocultar reseña", "review.delete": "Eliminar reseña",
}
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  discount_rule: "Combo", event: "Evento", gallery_item: "Galería", course: "Curso", contact: "Contacto",
  user: "Cuenta", access: "Acceso a curso", progress: "Progreso", review: "Reseña",
  post: "Noticia", instructor: "Instructor", lesson: "Lección", order: "Compra",
}

function calendarDate(value: unknown): string {
  const input = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return ""
  const date = new Date(`${input}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === input ? input : ""
}

/** Inclusive calendar dates in the academy's America/Bogota timezone. */
export function auditDateBoundary(value: string, endExclusive = false): string | null {
  const date = calendarDate(value)
  if (!date) return null
  const instant = new Date(`${date}T00:00:00-05:00`)
  if (endExclusive) instant.setUTCDate(instant.getUTCDate() + 1)
  return instant.toISOString()
}

export function normalizeAuditFilters(query: Query = {}) {
  const result = text(query.result)
  const action = text(query.action)
  const entity = text(query.entityType)
  return {
    action: Object.hasOwn(AUDIT_ACTION_LABELS, action) ? action : "",
    admin: text(query.admin), entityType: Object.hasOwn(AUDIT_ENTITY_LABELS, entity) ? entity : "",
    result: result === "success" || result === "error" ? result : "",
    dateFrom: calendarDate(query.dateFrom), dateTo: calendarDate(query.dateTo),
    page: normalizePage(query.page),
  }
}

export function pageQuery(input: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(input)
    .filter(([key, value]) => key !== "page" && value !== null && value !== "" && value !== undefined)
    .map(([key, value]) => [key, String(value)]))
}

export function decodeAdminPage<T>(value: unknown): { items: T[]; total: number; page: number; pageSize: number } {
  if (!value || typeof value !== "object") throw new Error("history_unavailable")
  const result = value as { items: T[]; total: number; page: number }
  if (!Array.isArray(result.items) || result.items.length > ADMIN_HISTORY_PAGE_SIZE ||
      !Number.isSafeInteger(result.total) || result.total < 0 ||
      !Number.isSafeInteger(result.page) || result.page < 1) throw new Error("history_unavailable")
  return { ...result, pageSize: ADMIN_HISTORY_PAGE_SIZE }
}
