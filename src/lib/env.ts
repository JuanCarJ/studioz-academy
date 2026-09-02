/**
 * Centralized environment variable validation.
 * Import from here instead of using process.env directly.
 */
function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function optionalEnv(key: string): string | null {
  const value = process.env[key]
  return value && value.trim().length > 0 ? value : null
}

export const env = {
  IS_VERCEL: () => process.env.VERCEL === "1",
  IS_PRODUCTION_DEPLOYMENT: () => process.env.APP_ENVIRONMENT === "production" || (process.env.VERCEL_ENV === "production" && process.env.APP_ENVIRONMENT !== "staging"),
  // Bold hosted checkout. Creation/settlement are explicit cutover switches.
  BOLD_IDENTITY_KEY: () => requireEnv("BOLD_IDENTITY_KEY"),
  BOLD_SECRET_KEY: () => requireEnv("BOLD_SECRET_KEY"),
  BOLD_ENVIRONMENT: (): "sandbox" | "production" => {
    const value = optionalEnv("BOLD_ENVIRONMENT") ?? "sandbox"
    if (value !== "sandbox" && value !== "production") throw new Error("Invalid BOLD_ENVIRONMENT")
    return value
  },
  BOLD_CHECKOUT_ENABLED: () => process.env.BOLD_CHECKOUT_ENABLED === "true",
  BOLD_SETTLEMENT_ENABLED: () => process.env.BOLD_SETTLEMENT_ENABLED === "true",
  BOLD_ALLOW_EMPTY_SANDBOX_WEBHOOK_KEY: () => process.env.BOLD_ALLOW_EMPTY_SANDBOX_WEBHOOK_KEY === "true" && process.env.BOLD_ENVIRONMENT === "sandbox",
  WOMPI_LEGACY_SETTLEMENT_ENABLED: () => process.env.WOMPI_LEGACY_SETTLEMENT_ENABLED === "true",
  // Supabase
  SUPABASE_URL: () => requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  SUPABASE_ANON_KEY: () => requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: () => requireEnv("SUPABASE_SERVICE_ROLE_KEY"),

  // Wompi
  WOMPI_PUBLIC_KEY: () => requireEnv("NEXT_PUBLIC_WOMPI_PUBLIC_KEY"),
  WOMPI_PRIVATE_KEY: () => requireEnv("WOMPI_PRIVATE_KEY"),
  WOMPI_EVENTS_SECRET: () => requireEnv("WOMPI_EVENTS_SECRET"),
  WOMPI_API_BASE_URL: () =>
    optionalEnv("WOMPI_API_BASE_URL") ?? "https://sandbox.wompi.co/v1",
  VERCEL_PROTECTION_BYPASS_SECRET: () =>
    optionalEnv("VERCEL_AUTOMATION_BYPASS_SECRET") ??
    optionalEnv("VERCEL_PROTECTION_BYPASS_SECRET"),

  // Bunny Stream
  BUNNY_API_KEY: () => requireEnv("BUNNY_API_KEY"),
  BUNNY_LIBRARY_ID: () => requireEnv("BUNNY_LIBRARY_ID"),
  BUNNY_CDN_HOSTNAME: () => requireEnv("BUNNY_CDN_HOSTNAME"),
  BUNNY_TOKEN_AUTH_KEY: () => requireEnv("BUNNY_TOKEN_AUTH_KEY"),
  BUNNY_WEBHOOK_SECRET: () => requireEnv("BUNNY_WEBHOOK_SECRET"),
  BUNNY_PLAYER_VERSION: (): "legacy" | "v2" => optionalEnv("BUNNY_PLAYER_VERSION") === "v2" ? "v2" : "legacy",

  // Email
  RESEND_API_KEY: () => requireEnv("RESEND_API_KEY"),

  // App
  APP_URL: () => requireEnv("NEXT_PUBLIC_APP_URL"),
  GOOGLE_MAPS_API_KEY: () => optionalEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"),
  WHATSAPP_NUMBER: () => optionalEnv("NEXT_PUBLIC_WHATSAPP_NUMBER") ?? optionalEnv("WHATSAPP_NUMBER") ?? "",
  OPTIONAL_WHATSAPP_NUMBER: () => optionalEnv("NEXT_PUBLIC_WHATSAPP_NUMBER") ?? optionalEnv("WHATSAPP_NUMBER"),

  // Cron
  CRON_SECRET: () => requireEnv("CRON_SECRET"),
} as const
