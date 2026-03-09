import { createClient } from "@supabase/supabase-js"

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

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

const qaPrefix = process.env.QA_RECORD_PREFIX ?? "QA"
const qaEmailDomain = process.env.QA_EMAIL_DOMAIN ?? "qa.studioz.local"

async function deleteByFilter(table, column, value) {
  const { error } = await supabase.from(table).delete().filter(column, "ilike", value)
  if (error) {
    throw error
  }
}

async function main() {
  console.info(`[qa:reset] Removing staging seed data with prefix ${qaPrefix}`)

  await deleteByFilter("contact_messages", "subject", `${qaPrefix}%`)
  await deleteByFilter("gallery_items", "caption", `${qaPrefix}%`)
  await deleteByFilter("events", "title", `${qaPrefix}%`)
  await deleteByFilter("posts", "title", `${qaPrefix}%`)
  await deleteByFilter("discount_rules", "name", `${qaPrefix}%`)
  await deleteByFilter("orders", "reference", "QA-%")
  await deleteByFilter("orders", "reference", "PILOT-%")

  const { data: userList, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })

  if (listError) {
    throw listError
  }

  const qaUsers = userList.users.filter((user) =>
    user.email?.endsWith(`@${qaEmailDomain}`)
  )

  if (qaUsers.length > 0) {
    const ids = qaUsers.map((user) => user.id)
    const { error: profilesError } = await supabase
      .from("profiles")
      .delete()
      .in("id", ids)

    if (profilesError) {
      throw profilesError
    }

    for (const user of qaUsers) {
      const { error } = await supabase.auth.admin.deleteUser(user.id)
      if (error) {
        throw error
      }
    }
  }

  console.info(
    JSON.stringify({
      scope: "qa.reset",
      removedUsers: qaUsers.length,
      qaEmailDomain,
    })
  )
}

main().catch((error) => {
  console.error("[qa:reset] Failed:", error)
  process.exitCode = 1
})
