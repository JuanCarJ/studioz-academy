import "server-only"
import { createHmac } from "node:crypto"
import { isIP } from "node:net"
import { headers } from "next/headers"

import { env } from "@/lib/env"
import { createServiceRoleClient } from "@/lib/supabase/admin"

export { RATE_LIMIT_MESSAGE } from "@/lib/auth/messages"

type RateLimitResult = { allowed: boolean; retryAfterSeconds: number }
type RateLimitInput = {
  scope: string
  key: string
  limit: number
  windowSeconds: number
}

/** Shared, atomic database counter. No per-instance fallback: errors deny. */
export async function enforceRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const denied = { allowed: false, retryAfterSeconds: input.windowSeconds }
  if (!input.key || !input.scope || !Number.isInteger(input.limit) || input.limit < 1 ||
      !Number.isInteger(input.windowSeconds) || input.windowSeconds < 1) return denied

  try {
    // Neither raw IPs, addresses nor user IDs are retained in the counter table.
    const key = createHmac("sha256", env.SUPABASE_SERVICE_ROLE_KEY())
      .update(JSON.stringify([input.scope, input.key]))
      .digest("hex")
    const { data, error } = await createServiceRoleClient().rpc("consume_rate_limit", {
      p_key: key,
      p_limit: input.limit,
      p_window_seconds: input.windowSeconds,
    })
    const result = data?.[0]
    if (error || !result || typeof result.allowed !== "boolean" ||
        !Number.isFinite(result.retry_after_seconds)) return denied
    return { allowed: result.allowed, retryAfterSeconds: result.retry_after_seconds }
  } catch {
    return denied
  }
}

/**
 * Vercel overwrites this header. Never trust arbitrary x-forwarded-for or form
 * input. Other hosts deliberately share a bucket until a trusted proxy adapter
 * exists. Subject limits also protect accounts when an attacker rotates IPs.
 */
export async function enforcePublicRateLimit(
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  let address = "shared"
  if (env.IS_VERCEL()) {
    const requestHeaders = await headers()
    const candidate = requestHeaders.get("x-vercel-forwarded-for")?.trim()
    if (candidate && isIP(candidate)) address = candidate
  }
  const ipResult = await enforceRateLimit({
    scope: `${scope}:ip`, key: address, limit: limit * 4, windowSeconds,
  })
  if (!ipResult.allowed || !key) return ipResult
  return enforceRateLimit({ scope: `${scope}:subject`, key, limit, windowSeconds })
}
