import fs from "node:fs"
import path from "node:path"

let loaded = false

function stripQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

export function loadLocalEnv(cwd = process.cwd()) {
  if (loaded) return

  const envPath = path.join(cwd, ".env.local")
  if (!fs.existsSync(envPath)) {
    loaded = true
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

  loaded = true
}

export function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

