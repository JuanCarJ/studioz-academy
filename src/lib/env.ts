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

export const env = {
  // Supabase
  SUPABASE_URL: () => requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  SUPABASE_ANON_KEY: () => requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: () => requireEnv("SUPABASE_SERVICE_ROLE_KEY"),

  // Wompi
  WOMPI_PUBLIC_KEY: () => requireEnv("NEXT_PUBLIC_WOMPI_PUBLIC_KEY"),
  WOMPI_PRIVATE_KEY: () => requireEnv("WOMPI_PRIVATE_KEY"),
  WOMPI_EVENTS_SECRET: () => requireEnv("WOMPI_EVENTS_SECRET"),

  // Bunny Stream
  BUNNY_API_KEY: () => requireEnv("BUNNY_API_KEY"),
  BUNNY_LIBRARY_ID: () => requireEnv("BUNNY_LIBRARY_ID"),
  BUNNY_CDN_HOSTNAME: () => requireEnv("BUNNY_CDN_HOSTNAME"),
  BUNNY_TOKEN_AUTH_KEY: () => requireEnv("BUNNY_TOKEN_AUTH_KEY"),

  // Email
  RESEND_API_KEY: () => requireEnv("RESEND_API_KEY"),

  // App
  APP_URL: () => requireEnv("NEXT_PUBLIC_APP_URL"),
  WHATSAPP_NUMBER: () => requireEnv("WHATSAPP_NUMBER"),
} as const
