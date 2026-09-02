import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
const guard = fileURLToPath(new URL("./no-provider-network.cjs", import.meta.url))
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", ...(process.argv.includes("--serve") ? ["start", "--hostname", "127.0.0.1", "--port", "3100"] : ["build", "--webpack"])], {
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: `--require=${guard}`, NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-publishable",
    SUPABASE_SERVICE_ROLE_KEY: "local-service", NEXT_PUBLIC_APP_URL: "http://localhost:3100",
    APP_ENVIRONMENT: "local", BOLD_ENVIRONMENT: "sandbox", BOLD_CHECKOUT_ENABLED: "false", BOLD_SETTLEMENT_ENABLED: "false",
    BOLD_IDENTITY_KEY: "local-identity", BOLD_SECRET_KEY: "local-secret", BOLD_ALLOW_EMPTY_SANDBOX_WEBHOOK_KEY: "false",
    WOMPI_LEGACY_SETTLEMENT_ENABLED: "false", BUNNY_API_KEY: "local-key", BUNNY_LIBRARY_ID: "123",
    BUNNY_TOKEN_AUTH_KEY: "local-key", BUNNY_WEBHOOK_SECRET: "local-key", BUNNY_CDN_HOSTNAME: "media.invalid",
    RESEND_API_KEY: "re_local", CRON_SECRET: "local-secret",
  },
})
process.exit(result.status ?? 1)
