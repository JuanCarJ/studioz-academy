"use server"

export async function listAuditLogs(filters?: {
  action?: string
  userId?: string
  dateFrom?: string
}) {
  // TODO: Query audit_logs table with filters
  console.log("admin.listAuditLogs", filters)
  return []
}
