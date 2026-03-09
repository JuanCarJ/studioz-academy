import { env } from "@/lib/env"

interface VercelBypassOptions {
  setCookie?: boolean
}

export function withVercelProtectionBypass(
  value: string | URL,
  options?: VercelBypassOptions
): string {
  const bypassSecret = env.VERCEL_PROTECTION_BYPASS_SECRET()
  const url = new URL(value.toString())

  if (!bypassSecret) {
    return url.toString()
  }

  url.searchParams.set("x-vercel-protection-bypass", bypassSecret)

  if (options?.setCookie ?? false) {
    url.searchParams.set("x-vercel-set-bypass-cookie", "true")
  }

  return url.toString()
}
