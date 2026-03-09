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
const adminEmail = process.env.QA_ADMIN_EMAIL ?? `admin@${qaEmailDomain}`
const adminPassword = process.env.QA_ADMIN_PASSWORD ?? "QaAdmin2026!"
const userEmail = process.env.QA_USER_EMAIL ?? `student@${qaEmailDomain}`
const userPassword = process.env.QA_USER_PASSWORD ?? "QaUser2026!"

const sampleImage =
  "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80"

async function ensureUser({ email, password, role, fullName }) {
  const { data: userList, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })

  if (listError) {
    throw listError
  }

  const existing = userList.users.find((user) => user.email === email)

  let userId = existing?.id

  if (!existing) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (error || !data.user) {
      throw error ?? new Error(`Unable to create user ${email}`)
    }

    userId = data.user.id
  } else {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (error) {
      throw error
    }
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      full_name: fullName,
      role,
      phone: null,
      avatar_url: null,
      email_notifications: true,
    },
    { onConflict: "id" }
  )

  if (profileError) {
    throw profileError
  }

  return userId
}

async function upsertOne(table, matchColumn, matchValue, payload) {
  const { data: existing, error: existingError } = await supabase
    .from(table)
    .select("id")
    .eq(matchColumn, matchValue)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing?.id) {
    const { error } = await supabase
      .from(table)
      .update(payload)
      .eq("id", existing.id)

    if (error) {
      throw error
    }

    return existing.id
  }

  const { data, error } = await supabase
    .from(table)
    .insert(payload)
    .select("id")
    .single()

  if (error || !data) {
    throw error ?? new Error(`Unable to insert into ${table}`)
  }

  return data.id
}

async function main() {
  console.info(`[qa:seed] Starting staging seed with prefix ${qaPrefix}`)

  const adminId = await ensureUser({
    email: adminEmail,
    password: adminPassword,
    role: "admin",
    fullName: `${qaPrefix} Admin Studio Z`,
  })

  const userId = await ensureUser({
    email: userEmail,
    password: userPassword,
    role: "user",
    fullName: `${qaPrefix} Student Studio Z`,
  })

  const discountRuleId = await upsertOne(
    "discount_rules",
    "name",
    `${qaPrefix} Combo Baile x2`,
    {
      name: `${qaPrefix} Combo Baile x2`,
      category: "baile",
      min_courses: 2,
      discount_type: "percentage",
      discount_value: 10,
      is_active: true,
    }
  )

  const postId = await upsertOne("posts", "slug", "qa-staging-editorial-smoke", {
    title: `${qaPrefix} Editorial Smoke`,
    slug: "qa-staging-editorial-smoke",
    excerpt: "Publicacion semilla para smoke editorial en staging.",
    content:
      "Esta publicacion fue creada por el seed oficial de QA para validar el flujo editorial.",
    cover_image_url: sampleImage,
    is_published: true,
    published_at: new Date().toISOString(),
  })

  const eventId = await upsertOne("events", "title", `${qaPrefix} Staging Open Class`, {
    title: `${qaPrefix} Staging Open Class`,
    description: "Evento semilla para smoke de eventos y agenda publica.",
    image_url: sampleImage,
    event_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    location: "Studio Z QA Floor",
    is_published: true,
  })

  const galleryId = await upsertOne(
    "gallery_items",
    "caption",
    `${qaPrefix} Gallery Smoke`,
    {
      caption: `${qaPrefix} Gallery Smoke`,
      category: "baile",
      image_url: sampleImage,
      sort_order: 999,
    }
  )

  const contactSubject = `${qaPrefix} contact smoke`
  const { data: existingContact, error: contactLookupError } = await supabase
    .from("contact_messages")
    .select("id")
    .eq("email", userEmail)
    .eq("subject", contactSubject)
    .maybeSingle()

  if (contactLookupError) {
    throw contactLookupError
  }

  if (!existingContact) {
    const { error: contactError } = await supabase.from("contact_messages").insert({
      name: `${qaPrefix} Contact Smoke`,
      email: userEmail,
      subject: contactSubject,
      message: "Mensaje semilla para validar inbox de contacto en staging.",
    })

    if (contactError) {
      throw contactError
    }
  }

  console.info(
    JSON.stringify({
      scope: "qa.seed",
      adminId,
      userId,
      discountRuleId,
      postId,
      eventId,
      galleryId,
      adminEmail,
      userEmail,
    })
  )
}

main().catch((error) => {
  console.error("[qa:seed] Failed:", error)
  process.exitCode = 1
})
