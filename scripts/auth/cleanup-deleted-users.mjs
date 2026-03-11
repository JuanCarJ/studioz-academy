import fs from "node:fs"
import path from "node:path"

import { createClient } from "@supabase/supabase-js"

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function loadLocalEnv(cwd = process.cwd()) {
  const envPath = path.join(cwd, ".env.local")
  if (!fs.existsSync(envPath)) {
    return
  }

  const raw = fs.readFileSync(envPath, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const equalIndex = trimmed.indexOf("=")
    if (equalIndex === -1) continue

    const key = trimmed.slice(0, equalIndex).trim()
    const value = stripQuotes(trimmed.slice(equalIndex + 1).trim())

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

loadLocalEnv()

const supabase = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

async function main() {
  const { data: deletedProfiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, deleted_at")
    .not("deleted_at", "is", null)

  if (profileError) {
    throw profileError
  }

  const profiles = deletedProfiles ?? []
  console.log(`[auth-cleanup] Found ${profiles.length} deleted profiles.`)

  let deletedUsers = 0
  let alreadyMissingUsers = 0

  for (const profile of profiles) {
    const { data: authUserData, error: authLookupError } = await supabase.auth.admin.getUserById(
      profile.id
    )

    if (authLookupError || !authUserData?.user) {
      alreadyMissingUsers += 1
      console.log(
        `[auth-cleanup] Skip ${profile.id}: auth user already missing or not accessible.`
      )
      continue
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(profile.id, true)
    if (deleteError) {
      console.error(`[auth-cleanup] Failed to delete auth user ${profile.id}:`, deleteError.message)
      continue
    }

    deletedUsers += 1
    console.log(
      `[auth-cleanup] Deleted auth user ${profile.id} (${authUserData.user.email ?? "no-email"}).`
    )
  }

  console.log(
    `[auth-cleanup] Completed. deleted=${deletedUsers} already-missing=${alreadyMissingUsers} total=${profiles.length}`
  )
}

main().catch((error) => {
  console.error("[auth-cleanup] Fatal error:", error)
  process.exitCode = 1
})
