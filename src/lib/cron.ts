import "server-only"
import { randomUUID, timingSafeEqual } from "node:crypto"
import { env } from "@/lib/env"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { paymentRpc } from "@/lib/payment-rpc"

const COUNT_KEYS = ["processed", "sent", "failed", "scheduled", "skipped", "reconciled", "notifications", "previewUpdates", "lessonUpdates", "errors"] as const
function safeCounts(result: Record<string, unknown>): Record<string, number | Record<string, number>> {
  const counts: Record<string, number | Record<string, number>> = {}
  for (const key of COUNT_KEYS) {
    const value = result[key]
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) counts[key] = value
  }
  for (const section of ["purchases", "courses"] as const) {
    const value = result[section]
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const sectionCounts: Record<string, number> = {}
    for (const key of COUNT_KEYS) {
      const count = (value as Record<string, unknown>)[key]
      if (typeof count === "number" && Number.isFinite(count) && count >= 0) sectionCounts[key] = count
    }
    counts[section] = sectionCounts
  }
  return counts
}

export async function runCronJob(request: Request, name: string, work: () => Promise<Record<string, unknown>>): Promise<Response> {
  const started = Date.now()
  let result = "failed"
  let counts: ReturnType<typeof safeCounts> = {}
  const log = () => console.info(JSON.stringify({
    scope: "cron.run", job: name, durationMs: Date.now() - started, result, skipped: result === "skipped", counts,
  }))
  let secret: string
  try { secret = env.CRON_SECRET() } catch {
    result = "unavailable"; log()
    return Response.json({ error: "Job unavailable" }, { status: 503 })
  }
  const actual = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    result = "unauthorized"; log()
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const token = randomUUID()
  let client: ReturnType<typeof createServiceRoleClient> | null = null
  let claimed = false
  try {
    client = createServiceRoleClient()
    claimed = await paymentRpc<boolean>(client, "claim_job_lease", { p_name: name, p_token: token, p_seconds: 90 })
    if (!claimed) { result = "skipped"; return Response.json({ ok: true, skipped: true }) }
    const output = await work()
    counts = safeCounts(output)
    result = "completed"
    return Response.json({ ok: true, ...output, timestamp: new Date().toISOString() })
  } catch {
    return Response.json({ ok: false, error: "Job failed; retry scheduled" }, { status: 503 })
  } finally {
    if (claimed && client) {
      try { await paymentRpc(client, "release_job_lease", { p_name: name, p_token: token }) }
      catch { console.error(JSON.stringify({ scope: "cron.release", job: name, result: "failed" })) }
    }
    log()
  }
}
