import "server-only"

import { createServiceRoleClient } from "@/lib/supabase/admin"

export type AccountCleanupResult = { status: "complete" | "pending" | "busy" | "ineligible" }
const LEASE_MS = 120_000

/** Called only after durable anonymization, or an authenticated administrator's retry. */
export async function completeAccountAuthCleanup(userId: string): Promise<AccountCleanupResult> {
  try {
    const client = createServiceRoleClient()
    const { data: profile, error: readError } = await client.from("profiles")
      .select("deleted_at, auth_cleanup_completed_at, auth_cleanup_started_at, auth_cleanup_attempts")
      .eq("id", userId).maybeSingle()
    if (readError) return { status: "pending" }
    if (!profile?.deleted_at) return { status: "ineligible" }
    if (profile.auth_cleanup_completed_at) return { status: "complete" }

    const now = new Date()
    const cutoff = new Date(now.getTime() - LEASE_MS).toISOString()
    if (profile.auth_cleanup_started_at && profile.auth_cleanup_started_at > cutoff) return { status: "busy" }
    const attempt = profile.auth_cleanup_attempts + 1
    // Compare-and-set plus an expiring lease: only one bounded attempt can start.
    const { data: claimed, error: claimError } = await client.from("profiles")
      .update({ auth_cleanup_started_at: now.toISOString(), auth_cleanup_attempts: attempt, auth_cleanup_error: null })
      .eq("id", userId).not("deleted_at", "is", null).is("auth_cleanup_completed_at", null)
      .eq("auth_cleanup_attempts", profile.auth_cleanup_attempts)
      .or(`auth_cleanup_started_at.is.null,auth_cleanup_started_at.lt.${cutoff}`)
      .select("id").maybeSingle()
    if (claimError) return { status: "pending" }
    if (!claimed) return { status: "busy" }

    let errorCode: string | null = null
    try {
      const { error } = await client.auth.admin.deleteUser(userId, true)
      // An already absent Auth identity is an idempotent successful cleanup.
      if (error && error.code !== "user_not_found") {
        errorCode = error.status === 429 ? "auth_rate_limited"
          : error.status && error.status >= 500 ? "auth_unavailable" : "auth_rejected"
      }
    } catch {
      errorCode = "auth_transport_error"
    }

    const { data: saved, error: saveError } = await client.from("profiles")
      .update({ auth_cleanup_completed_at: errorCode ? null : new Date().toISOString(),
        auth_cleanup_started_at: null, auth_cleanup_error: errorCode })
      .eq("id", userId).not("deleted_at", "is", null).is("auth_cleanup_completed_at", null)
      .eq("auth_cleanup_attempts", attempt).select("id").maybeSingle()
    // A lost receipt stays pending; a later retry can reconcile idempotently.
    return { status: !saveError && saved && !errorCode ? "complete" : "pending" }
  } catch {
    return { status: "pending" }
  }
}
