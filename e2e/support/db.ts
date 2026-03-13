import { createHash } from "node:crypto"

import { createClient } from "@supabase/supabase-js"

import { loadLocalEnv, requiredEnv } from "./env"

loadLocalEnv()

const sampleImage =
  "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80"

const fixedNow = new Date("2026-03-08T10:00:00.000Z").toISOString()

export const qaCredentials = {
  adminEmail: process.env.QA_ADMIN_EMAIL ?? "admin@qa.studioz.local",
  adminPassword: process.env.QA_ADMIN_PASSWORD ?? "QaAdmin2026!",
  userEmail: process.env.QA_USER_EMAIL ?? "student@qa.studioz.local",
  userPassword: process.env.QA_USER_PASSWORD ?? "QaUser2026!",
}

export const qaFixtures = {
  comboName: "QA E2E Combo Baile x2",
  publishedNewsTitle: "QA E2E Editorial Publica",
  publishedNewsSlug: "qa-e2e-editorial-publica",
  draftNewsTitle: "QA E2E Editorial Borrador",
  draftNewsSlug: "qa-e2e-editorial-borrador",
  upcomingEventTitle: "QA E2E Masterclass Proxima",
  pastEventTitle: "QA E2E Masterclass Pasada",
  galleryCaption: "QA E2E Gallery Highlight",
  danceInstructorName: "QA E2E Salsa Coach",
  danceInstructorSlug: "qa-e2e-salsa-coach",
  tattooInstructorName: "QA E2E Tattoo Mentor",
  tattooInstructorSlug: "qa-e2e-tattoo-mentor",
  paidPrimaryCourseTitle: "QA E2E Salsa Intensiva",
  paidPrimaryCourseSlug: "qa-e2e-salsa-intensiva",
  cartCourseOneTitle: "QA E2E Bachata Partnerwork",
  cartCourseOneSlug: "qa-e2e-bachata-partnerwork",
  cartCourseTwoTitle: "QA E2E Reggaeton Coreo",
  cartCourseTwoSlug: "qa-e2e-reggaeton-coreo",
  freeCourseTitle: "QA E2E Tatuaje Fundamentos Gratis",
  freeCourseSlug: "qa-e2e-tatuaje-fundamentos-gratis",
  orderReference: "QA-E2E-ORDER-APPROVED",
}

const qaBunnyLibraryId = process.env.BUNNY_LIBRARY_ID ?? "603019"

function optionalEnv(name: string) {
  const value = process.env[name]
  return value && value.trim().length > 0 ? value : null
}

function isSharedPlaywrightEnvironment() {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL
  if (!baseUrl) return false

  try {
    const hostname = new URL(baseUrl).hostname
    return hostname !== "localhost" && hostname !== "127.0.0.1"
  } catch {
    return false
  }
}

const qaSharedMediaMode = isSharedPlaywrightEnvironment()
const qaSharedPreviewVideoId = optionalEnv("QA_BUNNY_PREVIEW_VIDEO_ID")
const qaSharedLessonPreviewVideoId = optionalEnv("QA_BUNNY_LESSON_VIDEO_ID_PREVIEW")
const qaSharedLessonMainVideoId = optionalEnv("QA_BUNNY_LESSON_VIDEO_ID_MAIN")

function resolveQaLessonMedia(input: {
  localVideoId: string
  sharedVideoId?: string | null
}) {
  if (!qaSharedMediaMode) {
    return {
      bunnyVideoId: input.localVideoId,
      bunnyStatus: "ready",
      videoUploadError: null,
    } as const
  }

  if (input.sharedVideoId) {
    return {
      bunnyVideoId: input.sharedVideoId,
      bunnyStatus: "ready",
      videoUploadError: null,
    } as const
  }

  return {
    bunnyVideoId: "qa-media-not-configured",
    bunnyStatus: "error",
    videoUploadError: "Media QA no configurada en este entorno compartido.",
  } as const
}

const qaLessonMedia = {
  paidPreview: resolveQaLessonMedia({
    localVideoId: "11111111-1111-4111-8111-111111111111",
    sharedVideoId: qaSharedLessonPreviewVideoId,
  }),
  paidMain: resolveQaLessonMedia({
    localVideoId: "22222222-2222-4222-8222-222222222222",
    sharedVideoId: qaSharedLessonMainVideoId,
  }),
  cartOne: resolveQaLessonMedia({
    localVideoId: "33333333-3333-4333-8333-333333333333",
  }),
  cartTwo: resolveQaLessonMedia({
    localVideoId: "44444444-4444-4444-8444-444444444444",
  }),
  freeIntro: resolveQaLessonMedia({
    localVideoId: "55555555-5555-4555-8555-555555555555",
  }),
}

const qaCoursePreviewConfig = qaSharedMediaMode
  ? qaSharedPreviewVideoId
    ? {
        preview_video_url: null,
        preview_bunny_video_id: qaSharedPreviewVideoId,
        preview_bunny_library_id: qaBunnyLibraryId,
        preview_status: "ready",
        pending_preview_bunny_video_id: null,
        pending_preview_bunny_library_id: null,
        pending_preview_status: "none",
        preview_upload_error: null,
      }
    : {
        preview_video_url: null,
        preview_bunny_video_id: null,
        preview_bunny_library_id: null,
        preview_status: "none",
        pending_preview_bunny_video_id: null,
        pending_preview_bunny_library_id: null,
        pending_preview_status: "none",
        preview_upload_error: null,
      }
  : {
      preview_video_url: "https://iframe.mediadelivery.net/embed/603019/sample",
      preview_bunny_video_id: null,
      preview_bunny_library_id: null,
      preview_status: "legacy",
      pending_preview_bunny_video_id: null,
      pending_preview_bunny_library_id: null,
      pending_preview_status: "none",
      preview_upload_error: null,
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

export const e2eSupabase = supabase

function payloadHash(payload: string) {
  return createHash("sha256").update(payload).digest("hex")
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

async function upsertBy<T extends Record<string, unknown>>(
  table: string,
  match: Record<string, unknown>,
  payload: T
) {
  let query = supabase.from(table).select("id")
  for (const [key, value] of Object.entries(match)) {
    query = query.eq(key, value)
  }

  const { data: existing, error: lookupError } = await query.maybeSingle()
  if (lookupError) {
    throw lookupError
  }

  if (existing?.id) {
    const { error } = await supabase
      .from(table)
      .update(payload)
      .eq("id", existing.id)

    if (error) throw error
    return existing.id as string
  }

  const { data, error } = await supabase
    .from(table)
    .insert(payload)
    .select("id")
    .single()

  if (error || !data?.id) {
    throw error ?? new Error(`Unable to upsert ${table}`)
  }

  return data.id as string
}

async function upsertOrderByReference(payload: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("orders")
    .upsert(payload, { onConflict: "reference" })
    .select("id")
    .single()

  if (error || !data?.id) {
    throw error ?? new Error("Unable to upsert order by reference")
  }

  return data.id as string
}

async function ensureSinglePostImage(postId: string, imageUrl: string) {
  const { error: deleteError } = await supabase
    .from("post_images")
    .delete()
    .eq("post_id", postId)

  if (deleteError) throw deleteError

  const { error: insertError } = await supabase.from("post_images").insert({
    post_id: postId,
    image_url: imageUrl,
    sort_order: 0,
  })

  if (insertError) throw insertError
}

async function ensureUser(input: {
  email: string
  password: string
  role: "admin" | "user"
  fullName: string
}) {
  const { data: userList, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })

  if (listError) throw listError

  const existing = userList.users.find((user) => user.email === input.email)
  const userId = existing?.id

  if (!existing) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    })

    if (error || !data.user) {
      throw error ?? new Error(`Unable to create user ${input.email}`)
    }

    const createdId = data.user.id
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: createdId,
        full_name: input.fullName,
        phone: null,
        avatar_url: null,
        role: input.role,
        email_notifications: true,
      },
      { onConflict: "id" }
    )

    if (profileError) throw profileError
    return createdId
  }

  if (!userId) {
    throw new Error(`Unable to resolve existing user id for ${input.email}`)
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  })

  if (updateError) throw updateError

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      full_name: input.fullName,
      phone: null,
      avatar_url: null,
      role: input.role,
      email_notifications: true,
    },
    { onConflict: "id" }
  )

  if (profileError) throw profileError
  return userId
}

export async function ensureAuthUser(input: {
  email: string
  password: string
  role?: "admin" | "user"
  fullName: string
}) {
  return ensureUser({
    ...input,
    role: input.role ?? "user",
  })
}

export async function deleteAuthUserByEmail(email: string) {
  const { data: userList, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })

  if (error) throw error

  const authUser = userList.users.find((user) => user.email === email)
  if (!authUser) return

  const { error: deleteError } = await supabase.auth.admin.deleteUser(authUser.id)
  if (deleteError) throw deleteError
}

export async function markProfileAsDeleted(email: string) {
  const profile = await getProfileByEmail(email)
  if (!profile) {
    throw new Error(`Profile not found for ${email}`)
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: "Usuario eliminado",
      phone: null,
      avatar_url: null,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", profile.authUser.id)

  if (error) throw error

  return profile.authUser.id
}

async function deleteRowsByIds(table: string, ids: string[]) {
  if (ids.length === 0) return
  const { error } = await supabase.from(table).delete().in("id", ids)
  if (error) throw error
}

async function cleanupTransientBusinessState(userId: string, courseIds: string[]) {
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id")
    .in("course_id", courseIds)

  const lessonIds = (lessons ?? []).map((lesson) => lesson.id)

  if (lessonIds.length > 0) {
    await supabase
      .from("lesson_progress")
      .delete()
      .eq("user_id", userId)
      .in("lesson_id", lessonIds)
  }

  await supabase.from("course_progress").delete().eq("user_id", userId).in("course_id", courseIds)
  await supabase.from("reviews").delete().eq("user_id", userId).in("course_id", courseIds)
  await supabase.from("cart_items").delete().eq("user_id", userId)
  await supabase.from("enrollments").delete().eq("user_id", userId).in("course_id", courseIds)

  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .eq("reference", qaFixtures.orderReference)

  const orderIds = (orders ?? []).map((order) => order.id)
  if (orderIds.length > 0) {
    await supabase.from("order_discount_lines").delete().in("order_id", orderIds)
    await supabase.from("order_email_outbox").delete().in("order_id", orderIds)
    await supabase.from("payment_events").delete().in("order_id", orderIds)
    await supabase.from("enrollments").delete().in("order_id", orderIds)
    await supabase.from("order_items").delete().in("order_id", orderIds)
    await deleteRowsByIds("orders", orderIds)
  }

  await supabase.from("contact_messages").delete().ilike("subject", "QA E2E contact %")
  await supabase.from("posts").delete().ilike("slug", "qa-e2e-temp-%")
  await supabase
    .from("slug_redirects")
    .delete()
    .eq("entity_type", "post")
    .or("old_slug.ilike.qa-e2e-temp-%,new_slug.ilike.qa-e2e-temp-%")
  await supabase.from("gallery_items").delete().ilike("caption", "QA E2E Temp Gallery %")
  await supabase.from("events").delete().ilike("title", "QA E2E Temp Event %")
  await supabase.from("discount_rules").delete().ilike("name", "QA E2E Temporal %")
  await supabase.from("discount_rules").delete().ilike("name", "QA E2E Buy2Get1 %")
  await supabase.from("discount_rules").delete().ilike("name", "QA E2E Combo 100 %")
}

export async function ensureBusinessFixtures() {
  const adminId = await ensureUser({
    email: qaCredentials.adminEmail,
    password: qaCredentials.adminPassword,
    role: "admin",
    fullName: "QA Admin Studio Z",
  })

  const userId = await ensureUser({
    email: qaCredentials.userEmail,
    password: qaCredentials.userPassword,
    role: "user",
    fullName: "QA Student Studio Z",
  })

  await supabase
    .from("discount_rules")
    .update({ is_active: false })
    .ilike("name", "QA %")

  const comboId = await upsertBy("discount_rules", { name: qaFixtures.comboName }, {
    name: qaFixtures.comboName,
    category: "baile",
    combo_kind: "threshold_discount",
    min_courses: 2,
    discount_type: "percentage",
    discount_value: 10,
    buy_quantity: null,
    free_quantity: null,
    is_active: true,
  })

  await supabase
    .from("discount_rules")
    .update({ is_active: false })
    .eq("category", "baile")
    .neq("name", qaFixtures.comboName)

  const publishedPostId = await upsertBy("posts", { slug: qaFixtures.publishedNewsSlug }, {
    title: qaFixtures.publishedNewsTitle,
    slug: qaFixtures.publishedNewsSlug,
    excerpt: "Noticia publica semilla para validar editorial y detalle.",
    content: "Contenido semilla publicado para pruebas E2E de negocio.",
    cover_image_url: sampleImage,
    is_published: true,
    published_at: fixedNow,
  })
  await ensureSinglePostImage(publishedPostId, sampleImage)

  const draftPostId = await upsertBy("posts", { slug: qaFixtures.draftNewsSlug }, {
    title: qaFixtures.draftNewsTitle,
    slug: qaFixtures.draftNewsSlug,
    excerpt: "Borrador semilla invisible en el sitio publico.",
    content: "Este registro debe permanecer oculto del publico.",
    cover_image_url: sampleImage,
    is_published: false,
    published_at: null,
  })
  await ensureSinglePostImage(draftPostId, sampleImage)

  const upcomingEventId = await upsertBy("events", { title: qaFixtures.upcomingEventTitle }, {
    title: qaFixtures.upcomingEventTitle,
    description: "Evento futuro para validar agenda publica.",
    image_url: sampleImage,
    event_date: "2026-03-15T19:00:00.000Z",
    location: "Studio Z HQ",
    is_published: true,
  })

  const pastEventId = await upsertBy("events", { title: qaFixtures.pastEventTitle }, {
    title: qaFixtures.pastEventTitle,
    description: "Evento pasado para validar historico de agenda.",
    image_url: sampleImage,
    event_date: "2026-02-15T19:00:00.000Z",
    location: "Studio Z Archive",
    is_published: true,
  })

  await supabase.from("event_images").delete().in("event_id", [upcomingEventId, pastEventId])
  await supabase.from("event_images").insert([
    {
      event_id: upcomingEventId,
      image_url: sampleImage,
      sort_order: 0,
    },
    {
      event_id: pastEventId,
      image_url: sampleImage,
      sort_order: 0,
    },
  ])

  await upsertBy("gallery_items", { caption: qaFixtures.galleryCaption }, {
    caption: qaFixtures.galleryCaption,
    category: "baile",
    image_url: sampleImage,
    sort_order: 50,
  })

  await upsertBy(
    "instructor_specialty_options",
    { category: "baile", normalized_name: "salsa" },
    {
      name: "Salsa",
      normalized_name: "salsa",
      category: "baile",
    }
  )
  await upsertBy(
    "instructor_specialty_options",
    { category: "baile", normalized_name: "bachata" },
    {
      name: "Bachata",
      normalized_name: "bachata",
      category: "baile",
    }
  )
  await upsertBy(
    "instructor_specialty_options",
    { category: "tatuaje", normalized_name: "linea fina" },
    {
      name: "Linea Fina",
      normalized_name: "linea fina",
      category: "tatuaje",
    }
  )
  await upsertBy(
    "instructor_specialty_options",
    { category: "tatuaje", normalized_name: "blackwork" },
    {
      name: "Blackwork",
      normalized_name: "blackwork",
      category: "tatuaje",
    }
  )

  const danceInstructorId = await upsertBy(
    "instructors",
    { slug: qaFixtures.danceInstructorSlug },
    {
      slug: qaFixtures.danceInstructorSlug,
      full_name: qaFixtures.danceInstructorName,
      bio: "Instructor semilla de baile para QA E2E.",
      avatar_url: sampleImage,
      specialties: ["Salsa", "Bachata"],
      is_active: true,
    }
  )

  const tattooInstructorId = await upsertBy(
    "instructors",
    { slug: qaFixtures.tattooInstructorSlug },
    {
      slug: qaFixtures.tattooInstructorSlug,
      full_name: qaFixtures.tattooInstructorName,
      bio: "Instructor semilla de tatuaje para QA E2E.",
      avatar_url: sampleImage,
      specialties: ["Linea Fina", "Blackwork"],
      is_active: true,
    }
  )

  const paidPrimaryCourseId = await upsertBy(
    "courses",
    { slug: qaFixtures.paidPrimaryCourseSlug },
    {
      title: qaFixtures.paidPrimaryCourseTitle,
      slug: qaFixtures.paidPrimaryCourseSlug,
      description: "Curso pago principal para validar compras, reseñas y player.",
      short_description: "Salsa avanzada para pruebas E2E.",
      category: "baile",
      price: 12000000,
      is_free: false,
      thumbnail_url: sampleImage,
      ...qaCoursePreviewConfig,
      instructor_id: danceInstructorId,
      legacy_instructor_name: null,
      is_published: true,
      published_at: fixedNow,
      course_discount_enabled: false,
      course_discount_type: null,
      course_discount_value: null,
    }
  )

  const cartCourseOneId = await upsertBy(
    "courses",
    { slug: qaFixtures.cartCourseOneSlug },
    {
      title: qaFixtures.cartCourseOneTitle,
      slug: qaFixtures.cartCourseOneSlug,
      description: "Curso pago en carrito para validar combos.",
      short_description: "Bachata partnerwork QA.",
      category: "baile",
      price: 9000000,
      is_free: false,
      thumbnail_url: sampleImage,
      preview_video_url: null,
      preview_bunny_video_id: null,
      preview_bunny_library_id: null,
      preview_status: "none",
      pending_preview_bunny_video_id: null,
      pending_preview_bunny_library_id: null,
      pending_preview_status: "none",
      preview_upload_error: null,
      instructor_id: danceInstructorId,
      legacy_instructor_name: null,
      is_published: true,
      published_at: fixedNow,
      course_discount_enabled: false,
      course_discount_type: null,
      course_discount_value: null,
    }
  )

  const cartCourseTwoId = await upsertBy(
    "courses",
    { slug: qaFixtures.cartCourseTwoSlug },
    {
      title: qaFixtures.cartCourseTwoTitle,
      slug: qaFixtures.cartCourseTwoSlug,
      description: "Segundo curso pago para activar combo.",
      short_description: "Reggaeton coreografico QA.",
      category: "baile",
      price: 8000000,
      is_free: false,
      thumbnail_url: sampleImage,
      preview_video_url: null,
      preview_bunny_video_id: null,
      preview_bunny_library_id: null,
      preview_status: "none",
      pending_preview_bunny_video_id: null,
      pending_preview_bunny_library_id: null,
      pending_preview_status: "none",
      preview_upload_error: null,
      instructor_id: danceInstructorId,
      legacy_instructor_name: null,
      is_published: true,
      published_at: fixedNow,
      course_discount_enabled: false,
      course_discount_type: null,
      course_discount_value: null,
    }
  )

  const freeCourseId = await upsertBy(
    "courses",
    { slug: qaFixtures.freeCourseSlug },
    {
      title: qaFixtures.freeCourseTitle,
      slug: qaFixtures.freeCourseSlug,
      description: "Curso gratuito para validar inscripcion y acceso.",
      short_description: "Fundamentos gratuitos de tatuaje.",
      category: "tatuaje",
      price: 0,
      is_free: true,
      thumbnail_url: sampleImage,
      preview_video_url: null,
      preview_bunny_video_id: null,
      preview_bunny_library_id: null,
      preview_status: "none",
      pending_preview_bunny_video_id: null,
      pending_preview_bunny_library_id: null,
      pending_preview_status: "none",
      preview_upload_error: null,
      instructor_id: tattooInstructorId,
      legacy_instructor_name: null,
      is_published: true,
      published_at: fixedNow,
      course_discount_enabled: false,
      course_discount_type: null,
      course_discount_value: null,
    }
  )

  const courseIds = [paidPrimaryCourseId, cartCourseOneId, cartCourseTwoId, freeCourseId]

  await cleanupTransientBusinessState(userId, courseIds)

  const paidPreviewLessonId = await upsertBy(
    "lessons",
    { course_id: paidPrimaryCourseId, title: "QA E2E Preview Salsa" },
    {
      course_id: paidPrimaryCourseId,
      title: "QA E2E Preview Salsa",
      description: "Leccion gratuita del curso pago principal.",
      bunny_video_id: qaLessonMedia.paidPreview.bunnyVideoId,
      bunny_library_id: qaBunnyLibraryId,
      bunny_status: qaLessonMedia.paidPreview.bunnyStatus,
      pending_bunny_video_id: null,
      pending_bunny_library_id: null,
      pending_bunny_status: "none",
      video_upload_error: qaLessonMedia.paidPreview.videoUploadError,
      duration_seconds: 90,
      sort_order: 1,
      is_free: true,
    }
  )

  const paidMainLessonId = await upsertBy(
    "lessons",
    { course_id: paidPrimaryCourseId, title: "QA E2E Salsa Principal" },
    {
      course_id: paidPrimaryCourseId,
      title: "QA E2E Salsa Principal",
      description: "Leccion paga principal del curso de salsa.",
      bunny_video_id: qaLessonMedia.paidMain.bunnyVideoId,
      bunny_library_id: qaBunnyLibraryId,
      bunny_status: qaLessonMedia.paidMain.bunnyStatus,
      pending_bunny_video_id: null,
      pending_bunny_library_id: null,
      pending_bunny_status: "none",
      video_upload_error: qaLessonMedia.paidMain.videoUploadError,
      duration_seconds: 180,
      sort_order: 2,
      is_free: false,
    }
  )

  await upsertBy(
    "lessons",
    { course_id: cartCourseOneId, title: "QA E2E Bachata Intro" },
    {
      course_id: cartCourseOneId,
      title: "QA E2E Bachata Intro",
      description: "Leccion del curso de carrito uno.",
      bunny_video_id: qaLessonMedia.cartOne.bunnyVideoId,
      bunny_library_id: qaBunnyLibraryId,
      bunny_status: qaLessonMedia.cartOne.bunnyStatus,
      pending_bunny_video_id: null,
      pending_bunny_library_id: null,
      pending_bunny_status: "none",
      video_upload_error: qaLessonMedia.cartOne.videoUploadError,
      duration_seconds: 120,
      sort_order: 1,
      is_free: false,
    }
  )

  await upsertBy(
    "lessons",
    { course_id: cartCourseTwoId, title: "QA E2E Reggaeton Intro" },
    {
      course_id: cartCourseTwoId,
      title: "QA E2E Reggaeton Intro",
      description: "Leccion del curso de carrito dos.",
      bunny_video_id: qaLessonMedia.cartTwo.bunnyVideoId,
      bunny_library_id: qaBunnyLibraryId,
      bunny_status: qaLessonMedia.cartTwo.bunnyStatus,
      pending_bunny_video_id: null,
      pending_bunny_library_id: null,
      pending_bunny_status: "none",
      video_upload_error: qaLessonMedia.cartTwo.videoUploadError,
      duration_seconds: 120,
      sort_order: 1,
      is_free: false,
    }
  )

  await upsertBy(
    "lessons",
    { course_id: freeCourseId, title: "QA E2E Tatuaje Gratis Intro" },
    {
      course_id: freeCourseId,
      title: "QA E2E Tatuaje Gratis Intro",
      description: "Leccion gratuita del curso gratuito.",
      bunny_video_id: qaLessonMedia.freeIntro.bunnyVideoId,
      bunny_library_id: qaBunnyLibraryId,
      bunny_status: qaLessonMedia.freeIntro.bunnyStatus,
      pending_bunny_video_id: null,
      pending_bunny_library_id: null,
      pending_bunny_status: "none",
      video_upload_error: qaLessonMedia.freeIntro.videoUploadError,
      duration_seconds: 150,
      sort_order: 1,
      is_free: true,
    }
  )

  const primaryOrderId = await upsertOrderByReference({
    user_id: userId,
    reference: qaFixtures.orderReference,
    customer_name_snapshot: "QA Student Studio Z",
    customer_email_snapshot: qaCredentials.userEmail,
    customer_phone_snapshot: null,
    list_subtotal: 12000000,
    subtotal: 12000000,
    course_discount_amount: 0,
    combo_discount_amount: 0,
    discount_amount: 0,
    discount_rule_id: null,
    pricing_snapshot_json: null,
    total: 12000000,
    currency: "COP",
    status: "approved",
    payment_method: "CARD",
    payment_detail: "QA seeded approval",
    wompi_transaction_id: "qa-e2e-wompi-approved",
    approved_at: fixedNow,
  })

  await supabase.from("order_discount_lines").delete().eq("order_id", primaryOrderId)
  await supabase.from("order_email_outbox").delete().eq("order_id", primaryOrderId)
  await supabase.from("payment_events").delete().eq("order_id", primaryOrderId)
  await supabase.from("order_items").delete().eq("order_id", primaryOrderId)
  await supabase.from("enrollments").delete().eq("order_id", primaryOrderId)

  await supabase.from("order_items").insert({
    order_id: primaryOrderId,
    course_id: paidPrimaryCourseId,
    course_title_snapshot: qaFixtures.paidPrimaryCourseTitle,
    price_at_purchase: 12000000,
    list_price_snapshot: 12000000,
    course_discount_amount_snapshot: 0,
    price_after_course_discount_snapshot: 12000000,
    combo_discount_amount_snapshot: 0,
    final_price_snapshot: 12000000,
  })

  await supabase.from("payment_events").insert({
    order_id: primaryOrderId,
    source: "manual",
    wompi_transaction_id: "qa-e2e-wompi-approved",
    external_status: "APPROVED",
    mapped_status: "approved",
    is_applied: true,
    reason: "QA seeded approved order",
    payload_hash: payloadHash(qaFixtures.orderReference),
    payload_json: { source: "qa-seed", reference: qaFixtures.orderReference },
    processed_at: fixedNow,
  })

  await supabase.from("enrollments").insert({
    user_id: userId,
    course_id: paidPrimaryCourseId,
    source: "purchase",
    order_id: primaryOrderId,
  })

  await supabase.from("course_progress").upsert(
    {
      user_id: userId,
      course_id: paidPrimaryCourseId,
      last_lesson_id: paidPreviewLessonId,
      completed_lessons: 0,
      is_completed: false,
      last_accessed_at: fixedNow,
    },
    { onConflict: "user_id,course_id" }
  )

  return {
    adminId,
    userId,
    comboId,
    paidPrimaryCourseId,
    paidPreviewLessonId,
    paidMainLessonId,
    cartCourseOneId,
    cartCourseTwoId,
    freeCourseId,
    orderId: primaryOrderId,
  }
}

export async function getProfileByEmail(email: string) {
  const { data: userList, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })

  if (error) throw error

  const authUser = userList.users.find((user) => user.email === email)
  if (!authUser) return null

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authUser.id)
    .single()

  if (profileError) throw profileError

  return {
    authUser,
    profile,
  }
}

export async function getCourseBySlug(slug: string) {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("slug", slug)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getCourseById(id: string) {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getCourseByHomeFeaturedPosition(position: number) {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("home_featured_position", position)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getLessonByTitle(courseId: string, title: string) {
  const { data, error } = await supabase
    .from("lessons")
    .select("*")
    .eq("course_id", courseId)
    .eq("title", title)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function cleanupCourseTree(courseId: string) {
  const { data: lessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("id")
    .eq("course_id", courseId)

  if (lessonsError) throw lessonsError

  const lessonIds = (lessons ?? []).map((lesson) => lesson.id)

  if (lessonIds.length > 0) {
    const { error: lessonProgressError } = await supabase
      .from("lesson_progress")
      .delete()
      .in("lesson_id", lessonIds)

    if (lessonProgressError) throw lessonProgressError
  }

  const { error: courseProgressError } = await supabase
    .from("course_progress")
    .delete()
    .eq("course_id", courseId)

  if (courseProgressError) throw courseProgressError

  const { error: enrollmentsError } = await supabase
    .from("enrollments")
    .delete()
    .eq("course_id", courseId)

  if (enrollmentsError) throw enrollmentsError

  const { error: cartItemsError } = await supabase
    .from("cart_items")
    .delete()
    .eq("course_id", courseId)

  if (cartItemsError) throw cartItemsError

  if (lessonIds.length > 0) {
    const { error: lessonsDeleteError } = await supabase
      .from("lessons")
      .delete()
      .in("id", lessonIds)

    if (lessonsDeleteError) throw lessonsDeleteError
  }

  const { error: courseDeleteError } = await supabase
    .from("courses")
    .delete()
    .eq("id", courseId)

  if (courseDeleteError) throw courseDeleteError
}

export async function cleanupCoursesBySlugPrefix(slugPrefix: string) {
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id")
    .ilike("slug", `${slugPrefix}%`)

  if (error) throw error

  for (const course of courses ?? []) {
    await cleanupCourseTree(course.id)
  }
}

export async function getInstructorBySlug(slug: string) {
  const { data, error } = await supabase
    .from("instructors")
    .select("*")
    .eq("slug", slug)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getCartItemsForEmail(email: string) {
  const profile = await getProfileByEmail(email)
  if (!profile) return []

  const { data, error } = await supabase
    .from("cart_items")
    .select("id, course_id, added_at")
    .eq("user_id", profile.authUser.id)

  if (error) throw error
  return data ?? []
}

export async function getEnrollment(email: string, courseId: string) {
  const profile = await getProfileByEmail(email)
  if (!profile) return null

  const { data, error } = await supabase
    .from("enrollments")
    .select("*")
    .eq("user_id", profile.authUser.id)
    .eq("course_id", courseId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getLessonProgress(email: string, lessonId: string) {
  const profile = await getProfileByEmail(email)
  if (!profile) return null

  const { data, error } = await supabase
    .from("lesson_progress")
    .select("*")
    .eq("user_id", profile.authUser.id)
    .eq("lesson_id", lessonId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getCourseProgress(email: string, courseId: string) {
  const profile = await getProfileByEmail(email)
  if (!profile) return null

  const { data, error } = await supabase
    .from("course_progress")
    .select("*")
    .eq("user_id", profile.authUser.id)
    .eq("course_id", courseId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function resetCourseProgressForEmail(input: {
  email: string
  courseId: string
  lastLessonId?: string | null
}) {
  const profile = await getProfileByEmail(input.email)
  if (!profile) {
    throw new Error(`Profile not found for ${input.email}`)
  }

  const { data: lessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("id")
    .eq("course_id", input.courseId)

  if (lessonsError) throw lessonsError

  const lessonIds = (lessons ?? []).map((lesson) => lesson.id)
  if (lessonIds.length > 0) {
    const { error: lessonProgressError } = await supabase
      .from("lesson_progress")
      .delete()
      .eq("user_id", profile.authUser.id)
      .in("lesson_id", lessonIds)

    if (lessonProgressError) throw lessonProgressError
  }

  const { error: progressError } = await supabase.from("course_progress").upsert(
    {
      user_id: profile.authUser.id,
      course_id: input.courseId,
      last_lesson_id: input.lastLessonId ?? null,
      completed_lessons: 0,
      is_completed: false,
      last_accessed_at: fixedNow,
    },
    { onConflict: "user_id,course_id" }
  )

  if (progressError) throw progressError
}

export async function deleteCourseProgressForEmail(input: {
  email: string
  courseId: string
}) {
  const profile = await getProfileByEmail(input.email)
  if (!profile) {
    throw new Error(`Profile not found for ${input.email}`)
  }

  const { error } = await supabase
    .from("course_progress")
    .delete()
    .eq("user_id", profile.authUser.id)
    .eq("course_id", input.courseId)

  if (error) throw error
}

export async function upsertCourseProgressForEmail(input: {
  email: string
  courseId: string
  lastLessonId?: string | null
  completedLessons?: number
  isCompleted?: boolean
  lastAccessedAt?: string
}) {
  const profile = await getProfileByEmail(input.email)
  if (!profile) {
    throw new Error(`Profile not found for ${input.email}`)
  }

  const { error } = await supabase.from("course_progress").upsert(
    {
      user_id: profile.authUser.id,
      course_id: input.courseId,
      last_lesson_id: input.lastLessonId ?? null,
      completed_lessons: input.completedLessons ?? 0,
      is_completed: input.isCompleted ?? false,
      last_accessed_at: input.lastAccessedAt ?? fixedNow,
    },
    { onConflict: "user_id,course_id" }
  )

  if (error) throw error
}

export async function upsertLessonCompletionForEmail(input: {
  email: string
  lessonId: string
  completed: boolean
  position?: number
}) {
  const profile = await getProfileByEmail(input.email)
  if (!profile) {
    throw new Error(`Profile not found for ${input.email}`)
  }

  const { error } = await supabase.from("lesson_progress").upsert(
    {
      user_id: profile.authUser.id,
      lesson_id: input.lessonId,
      completed: input.completed,
      completed_at: input.completed ? fixedNow : null,
      video_position: input.position ?? 0,
    },
    { onConflict: "user_id,lesson_id" }
  )

  if (error) throw error
}

export async function upsertLessonVideoPositionForEmail(input: {
  email: string
  lessonId: string
  position: number
}) {
  const profile = await getProfileByEmail(input.email)
  if (!profile) {
    throw new Error(`Profile not found for ${input.email}`)
  }

  const { error } = await supabase.from("lesson_progress").upsert(
    {
      user_id: profile.authUser.id,
      lesson_id: input.lessonId,
      video_position: input.position,
    },
    { onConflict: "user_id,lesson_id" }
  )

  if (error) throw error
}

export async function getReviewForCourse(email: string, courseId: string) {
  const profile = await getProfileByEmail(email)
  if (!profile) return null

  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("user_id", profile.authUser.id)
    .eq("course_id", courseId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function ensureReviewForCourse(input: {
  email: string
  courseId: string
  rating: number
  text: string
  isVisible?: boolean
}) {
  const profile = await getProfileByEmail(input.email)
  if (!profile) return null

  const existing = await getReviewForCourse(input.email, input.courseId)

  if (existing?.id) {
    const { data, error } = await supabase
      .from("reviews")
      .update({
        rating: input.rating,
        text: input.text,
        is_visible: input.isVisible ?? true,
      })
      .eq("id", existing.id)
      .select("*")
      .single()

    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from("reviews")
    .insert({
      user_id: profile.authUser.id,
      course_id: input.courseId,
      rating: input.rating,
      text: input.text,
      is_visible: input.isVisible ?? true,
    })
    .select("*")
    .single()

  if (error) throw error
  return data
}

export async function getContactMessagesBySubject(subject: string) {
  const { data, error } = await supabase
    .from("contact_messages")
    .select("*")
    .eq("subject", subject)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getOrderByReference(reference: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("reference", reference)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getLatestOrderForEmail(email: string) {
  const profile = await getProfileByEmail(email)
  if (!profile) return null

  const { data, error } = await supabase
    .from("orders")
    .select("*, items:order_items(*), discount_lines:order_discount_lines(*)")
    .eq("user_id", profile.authUser.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getOutboxEntry(orderId: string) {
  const { data, error } = await supabase
    .from("order_email_outbox")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getAuditLogsByAction(action: string) {
  const { data, error } = await supabase
    .from("admin_audit_logs")
    .select("*")
    .eq("action", action)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getPostBySlug(slug: string) {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("slug", slug)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getPostImages(postId: string) {
  const { data, error } = await supabase
    .from("post_images")
    .select("*")
    .eq("post_id", postId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getDiscountRuleByName(name: string) {
  const { data, error } = await supabase
    .from("discount_rules")
    .select("*")
    .eq("name", name)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getGalleryItemByCaption(caption: string) {
  const { data, error } = await supabase
    .from("gallery_items")
    .select("*")
    .eq("caption", caption)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getEventByTitle(title: string) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("title", title)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getEventImages(eventId: string) {
  const { data, error } = await supabase
    .from("event_images")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getActiveDiscountRules() {
  const { data, error } = await supabase
    .from("discount_rules")
    .select("*")
    .eq("is_active", true)

  if (error) throw error
  return data ?? []
}

export async function clearUserCart(email: string) {
  const profile = await getProfileByEmail(email)
  if (!profile) return

  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("user_id", profile.authUser.id)

  if (error) throw error
}

export { slugify }
