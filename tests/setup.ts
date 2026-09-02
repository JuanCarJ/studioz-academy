import { afterEach, beforeEach, vi } from "vitest"

// Deterministic tests never load .env.local or access a provider.
Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: "https://supabase.invalid",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  NEXT_PUBLIC_APP_URL: "http://localhost:3100",
  CRON_SECRET: "local-test-cron-secret",
  BUNNY_API_KEY: "local-test-key", BUNNY_LIBRARY_ID: "123", BUNNY_CDN_HOSTNAME: "media.invalid",
  BUNNY_TOKEN_AUTH_KEY: "local-token-key", BUNNY_WEBHOOK_SECRET: "local-webhook-key",
  BOLD_IDENTITY_KEY: "local-bold-identity", BOLD_SECRET_KEY: "local-bold-secret",
  BOLD_ENVIRONMENT: "sandbox", BOLD_CHECKOUT_ENABLED: "false", BOLD_SETTLEMENT_ENABLED: "false",
  RESEND_API_KEY: "re_local_test_key",
})

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Network disabled: provide an explicit local test double"))))
})
afterEach(() => vi.unstubAllGlobals())
