export const ADMIN_OPERATIONS = [
  "course.archive",
  "course.restore",
  "contact.update",
  "user.note",
  "user.suspend",
  "user.resume",
  "access.restore",
  "access.revoke",
  "progress.reset",
] as const
export type AdminOperation = (typeof ADMIN_OPERATIONS)[number]
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function validAdminOperation(
  action: string,
  target: string,
  reason: string
) {
  return (
    ADMIN_OPERATIONS.includes(action as AdminOperation) &&
    UUID_PATTERN.test(target) &&
    reason.trim().length >= 5 &&
    reason.trim().length <= 2000
  )
}
export function normalizePage(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(10000, Math.max(1, Math.floor(n))) : 1
}
