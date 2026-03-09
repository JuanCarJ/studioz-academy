import { createHash } from "node:crypto"

import { createClient } from "@supabase/supabase-js"

import {
  ensureBusinessFixtures,
  getInstructorBySlug,
  getProfileByEmail,
  qaCredentials,
  qaFixtures,
} from "./db"
import { loadLocalEnv, requiredEnv } from "./env"

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

const wompiApiBaseUrl = process.env.WOMPI_API_BASE_URL ?? "https://sandbox.wompi.co/v1"
const wompiPublicKey = requiredEnv("NEXT_PUBLIC_WOMPI_PUBLIC_KEY")
const wompiPrivateKey = requiredEnv("WOMPI_PRIVATE_KEY")
const wompiIntegrityKey = requiredEnv("WOMPI_INTEGRITY_KEY")

const wompiSampleImage =
  "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80"

type ExpectedOrderStatus = "approved" | "declined"

type CardScenarioConfig = {
  method: "CARD"
  cardNumber: string
}

type NequiScenarioConfig = {
  method: "NEQUI"
  phoneNumber: string
}

type PseScenarioConfig = {
  method: "PSE"
  financialInstitutionCode: string
}

type BancolombiaQrScenarioConfig = {
  method: "BANCOLOMBIA_QR"
  sandboxStatus: "APPROVED" | "DECLINED" | "ERROR"
}

type PcolScenarioConfig = {
  method: "PCOL"
  sandboxStatus:
    | "APPROVED_ONLY_POINTS"
    | "APPROVED_HALF_POINTS"
    | "DECLINED"
    | "ERROR"
}

export type WompiScenarioConfig =
  | CardScenarioConfig
  | NequiScenarioConfig
  | PseScenarioConfig
  | BancolombiaQrScenarioConfig
  | PcolScenarioConfig

export interface WompiScenario {
  name: string
  slug: string
  config: WompiScenarioConfig
  expectedWompiStatus: "APPROVED" | "DECLINED" | "ERROR"
  expectedOrderStatus: ExpectedOrderStatus
}

export interface WompiScenarioResult {
  reference: string
  transactionId: string
  payerEmail: string
  wompiStatus: string
  order: {
    id: string
    reference: string
    status: string
    payment_method: string | null
    customer_email_snapshot: string
    wompi_transaction_id: string | null
    total: number
  }
  paymentEvents: Array<{
    source: string
    external_status: string
    mapped_status: string
    is_applied: boolean
    reason: string | null
    payload_json?: {
      data?: { transaction?: { customer_email?: string } }
    }
  }>
  enrollmentsCount: number
  cartItemsCount: number
  outboxStatus: string | null
}

export class UnsupportedWompiScenarioError extends Error {}

export class UnresolvedWompiScenarioError extends Error {}

export interface WompiCapabilityProbeResult {
  outcome: "unsupported" | "pending_only" | "finalized"
  reason: string | null
  reference: string | null
  transactionId: string | null
  orderStatus: string | null
  paymentEventsCount: number
  wompiStatus: string | null
}

const defaultAmountInCents = 200000

export const wompiSandboxScenarios: WompiScenario[] = [
  {
    name: "Card approved",
    slug: "card-approved",
    config: { method: "CARD", cardNumber: "4242424242424242" },
    expectedWompiStatus: "APPROVED",
    expectedOrderStatus: "approved",
  },
  {
    name: "Card declined",
    slug: "card-declined",
    config: { method: "CARD", cardNumber: "4111111111111111" },
    expectedWompiStatus: "DECLINED",
    expectedOrderStatus: "declined",
  },
  {
    name: "Card error",
    slug: "card-error",
    config: { method: "CARD", cardNumber: "4000000000000002" },
    expectedWompiStatus: "ERROR",
    expectedOrderStatus: "declined",
  },
  {
    name: "Nequi approved",
    slug: "nequi-approved",
    config: { method: "NEQUI", phoneNumber: "3991111111" },
    expectedWompiStatus: "APPROVED",
    expectedOrderStatus: "approved",
  },
  {
    name: "Nequi declined",
    slug: "nequi-declined",
    config: { method: "NEQUI", phoneNumber: "3992222222" },
    expectedWompiStatus: "DECLINED",
    expectedOrderStatus: "declined",
  },
  {
    name: "Nequi error",
    slug: "nequi-error",
    config: { method: "NEQUI", phoneNumber: "3990000000" },
    expectedWompiStatus: "ERROR",
    expectedOrderStatus: "declined",
  },
  {
    name: "PSE approved",
    slug: "pse-approved",
    config: { method: "PSE", financialInstitutionCode: "1" },
    expectedWompiStatus: "APPROVED",
    expectedOrderStatus: "approved",
  },
  {
    name: "PSE declined",
    slug: "pse-declined",
    config: { method: "PSE", financialInstitutionCode: "2" },
    expectedWompiStatus: "DECLINED",
    expectedOrderStatus: "declined",
  },
  {
    name: "Bancolombia QR approved",
    slug: "bancolombia-qr-approved",
    config: { method: "BANCOLOMBIA_QR", sandboxStatus: "APPROVED" },
    expectedWompiStatus: "APPROVED",
    expectedOrderStatus: "approved",
  },
  {
    name: "Bancolombia QR declined",
    slug: "bancolombia-qr-declined",
    config: { method: "BANCOLOMBIA_QR", sandboxStatus: "DECLINED" },
    expectedWompiStatus: "DECLINED",
    expectedOrderStatus: "declined",
  },
  {
    name: "Bancolombia QR error",
    slug: "bancolombia-qr-error",
    config: { method: "BANCOLOMBIA_QR", sandboxStatus: "ERROR" },
    expectedWompiStatus: "ERROR",
    expectedOrderStatus: "declined",
  },
  {
    name: "PCOL approved only points",
    slug: "pcol-approved-only-points",
    config: { method: "PCOL", sandboxStatus: "APPROVED_ONLY_POINTS" },
    expectedWompiStatus: "APPROVED",
    expectedOrderStatus: "approved",
  },
  {
    name: "PCOL approved half points",
    slug: "pcol-approved-half-points",
    config: { method: "PCOL", sandboxStatus: "APPROVED_HALF_POINTS" },
    expectedWompiStatus: "APPROVED",
    expectedOrderStatus: "approved",
  },
  {
    name: "PCOL declined",
    slug: "pcol-declined",
    config: { method: "PCOL", sandboxStatus: "DECLINED" },
    expectedWompiStatus: "DECLINED",
    expectedOrderStatus: "declined",
  },
  {
    name: "PCOL error",
    slug: "pcol-error",
    config: { method: "PCOL", sandboxStatus: "ERROR" },
    expectedWompiStatus: "ERROR",
    expectedOrderStatus: "declined",
  },
]

export const wompiDeterministicScenarios = wompiSandboxScenarios.filter((scenario) =>
  ["CARD", "NEQUI", "PSE"].includes(scenario.config.method)
)

export const wompiCapabilityProbeScenarios = {
  bancolombiaQrApproved: wompiSandboxScenarios.find(
    (scenario) =>
      scenario.config.method === "BANCOLOMBIA_QR" &&
      scenario.config.sandboxStatus === "APPROVED"
  )!,
  pcolApprovedOnlyPoints: wompiSandboxScenarios.find(
    (scenario) =>
      scenario.config.method === "PCOL" &&
      scenario.config.sandboxStatus === "APPROVED_ONLY_POINTS"
  )!,
} as const

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function scenarioReference(slug: string) {
  return `QA-WOMPI-${slug}-${Date.now().toString(36)}`.toUpperCase()
}

function scenarioSlug(slug: string) {
  return `qa-wompi-${slug}-${Date.now().toString(36)}`
}

function integritySignature(reference: string, amountInCents: number, currency = "COP") {
  return createHash("sha256")
    .update(`${reference}${amountInCents}${currency}${wompiIntegrityKey}`)
    .digest("hex")
}

async function getAcceptanceTokens() {
  const response = await fetch(`${wompiApiBaseUrl}/merchants/${wompiPublicKey}`, {
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Wompi merchant lookup failed with ${response.status}`)
  }

  const json = await response.json()
  const acceptanceToken = json.data?.presigned_acceptance?.acceptance_token as
    | string
    | undefined
  const personalDataToken = json.data?.presigned_personal_data_auth?.acceptance_token as
    | string
    | undefined

  if (!acceptanceToken || !personalDataToken) {
    throw new Error("Wompi acceptance tokens are missing in merchant response")
  }

  return { acceptanceToken, personalDataToken }
}

async function createCardToken(cardNumber: string) {
  const response = await fetch(`${wompiApiBaseUrl}/tokens/cards`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${wompiPublicKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      number: cardNumber,
      cvc: "123",
      exp_month: "12",
      exp_year: "29",
      card_holder: "QA Studio Z",
    }),
  })

  const json = await response.json()
  if (!response.ok) {
    throw new Error(
      `Wompi card tokenization failed (${response.status}): ${JSON.stringify(json)}`
    )
  }

  const token = json.data?.id as string | undefined
  if (!token) {
    throw new Error("Wompi card token response did not include a token id")
  }

  return token
}

async function createTransaction(input: {
  reference: string
  amountInCents: number
  customerEmail: string
  config: WompiScenarioConfig
}) {
  const { acceptanceToken, personalDataToken } = await getAcceptanceTokens()

  let paymentMethod: Record<string, unknown>
  switch (input.config.method) {
    case "CARD":
      paymentMethod = {
        type: "CARD",
        token: await createCardToken(input.config.cardNumber),
        installments: 1,
      }
      break
    case "NEQUI":
      paymentMethod = {
        type: "NEQUI",
        phone_number: input.config.phoneNumber,
      }
      break
    case "PSE":
      paymentMethod = {
        type: "PSE",
        user_type: 0,
        user_legal_id_type: "CC",
        user_legal_id: "1000755279",
        financial_institution_code: input.config.financialInstitutionCode,
        payment_description: `QA Sandbox ${input.reference}`,
      }
      break
    case "BANCOLOMBIA_QR":
      paymentMethod = {
        type: "BANCOLOMBIA_QR",
        sandbox_status: input.config.sandboxStatus,
      }
      break
    case "PCOL":
      paymentMethod = {
        type: "PCOL",
        sandbox_status: input.config.sandboxStatus,
      }
      break
  }

  const response = await fetch(`${wompiApiBaseUrl}/transactions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${wompiPrivateKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount_in_cents: input.amountInCents,
      currency: "COP",
      customer_email: input.customerEmail,
      reference: input.reference,
      acceptance_token: acceptanceToken,
      accept_personal_auth: personalDataToken,
      signature: integritySignature(input.reference, input.amountInCents),
      payment_method: paymentMethod,
    }),
  })

  const json = await response.json()
  if (!response.ok) {
    const reason =
      json?.error?.reason ??
      json?.error?.messages?.join?.(", ") ??
      JSON.stringify(json)

    if (
      response.status === 404 ||
      /No hay una identidad de pago/i.test(String(reason)) ||
      /not enabled|not available/i.test(String(reason))
    ) {
      throw new UnsupportedWompiScenarioError(
        `Wompi sandbox no tiene habilitado ${input.config.method}: ${String(reason)}`
      )
    }

    throw new Error(`Wompi transaction creation failed (${response.status}): ${reason}`)
  }

  const transactionId = json.data?.id as string | undefined
  if (!transactionId) {
    throw new Error("Wompi transaction response did not include a transaction id")
  }

  return { transactionId }
}

async function getTransactionById(transactionId: string) {
  const response = await fetch(
    `${wompiApiBaseUrl}/transactions/${encodeURIComponent(transactionId)}`,
    {
      headers: { Authorization: `Bearer ${wompiPublicKey}` },
      cache: "no-store",
    }
  )

  const json = await response.json()
  if (!response.ok) {
    throw new Error(
      `Wompi transaction lookup failed (${response.status}): ${JSON.stringify(json)}`
    )
  }

  return json.data as {
    id: string
    status: string
    reference: string
    amount_in_cents: number
    currency: string
    payment_method_type: string | null
  }
}

async function awaitFinalTransactionStatus(transactionId: string) {
  const deadline = Date.now() + 90_000

  while (Date.now() < deadline) {
    const transaction = await getTransactionById(transactionId)
    if (transaction.status !== "PENDING") {
      return transaction
    }

    await wait(2_000)
  }

  throw new UnresolvedWompiScenarioError(
    `Wompi dejo la transaccion ${transactionId} en PENDING por mas de 90 segundos`
  )
}

async function ensureScenarioCourse(input: {
  scenarioSlug: string
  amountInCents: number
}) {
  await ensureBusinessFixtures()

  const instructor = await getInstructorBySlug(qaFixtures.danceInstructorSlug)
  if (!instructor?.id) {
    throw new Error("Unable to resolve QA instructor for Wompi scenarios")
  }

  const title = `QA Wompi ${input.scenarioSlug}`
  const slug = scenarioSlug(input.scenarioSlug)

  const { data, error } = await supabase
    .from("courses")
    .insert({
      title,
      slug,
      description: `Curso temporal automatizado para ${input.scenarioSlug}.`,
      short_description: `Prueba automatizada ${input.scenarioSlug}.`,
      category: "baile",
      price: input.amountInCents,
      is_free: false,
      thumbnail_url: wompiSampleImage,
      preview_video_url: null,
      instructor_id: instructor.id,
      legacy_instructor_name: null,
      is_published: true,
      published_at: new Date().toISOString(),
    })
    .select("id, title, slug")
    .single()

  if (error || !data) {
    throw error ?? new Error("Unable to create Wompi scenario course")
  }

  return data
}

async function createScenarioOrder(input: {
  scenario: WompiScenario
  amountInCents: number
}) {
  const profile = await getProfileByEmail(qaCredentials.userEmail)
  if (!profile?.authUser) {
    throw new Error("Unable to resolve QA user for Wompi scenarios")
  }

  await supabase.from("cart_items").delete().eq("user_id", profile.authUser.id)

  const course = await ensureScenarioCourse({
    scenarioSlug: input.scenario.slug,
    amountInCents: input.amountInCents,
  })

  const reference = scenarioReference(input.scenario.slug)
  const payerEmail = `payer+${input.scenario.slug}.${Date.now()}@studioz-test.com`

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: profile.authUser.id,
      reference,
      customer_name_snapshot: profile.profile.full_name,
      customer_email_snapshot: qaCredentials.userEmail,
      customer_phone_snapshot: profile.profile.phone,
      subtotal: input.amountInCents,
      discount_amount: 0,
      discount_rule_id: null,
      total: input.amountInCents,
      currency: "COP",
      status: "pending",
      cart_hash: createHash("sha256")
        .update(`${course.id}:${input.amountInCents}`)
        .digest("hex"),
    })
    .select("id")
    .single()

  if (orderError || !order?.id) {
    throw orderError ?? new Error("Unable to create Wompi scenario order")
  }

  const { error: itemError } = await supabase.from("order_items").insert({
    order_id: order.id,
    course_id: course.id,
    course_title_snapshot: course.title,
    price_at_purchase: input.amountInCents,
  })

  if (itemError) throw itemError

  const { error: cartError } = await supabase.from("cart_items").insert({
    user_id: profile.authUser.id,
    course_id: course.id,
  })

  if (cartError) throw cartError

  return {
    orderId: order.id,
    userId: profile.authUser.id,
    courseId: course.id,
    reference,
    payerEmail,
  }
}

async function awaitScenarioResult(input: {
  orderId: string
  userId: string
  courseId: string
  reference: string
}) {
  const deadline = Date.now() + 90_000

  while (Date.now() < deadline) {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, reference, status, payment_method, customer_email_snapshot, wompi_transaction_id, total"
      )
      .eq("id", input.orderId)
      .single()

    if (orderError) throw orderError

    const { data: paymentEvents, error: eventsError } = await supabase
      .from("payment_events")
      .select("source, external_status, mapped_status, is_applied, reason, payload_json")
      .eq("order_id", input.orderId)
      .order("processed_at", { ascending: true })

    if (eventsError) throw eventsError

    const { count: enrollmentsCount, error: enrollmentsError } = await supabase
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("order_id", input.orderId)
      .eq("course_id", input.courseId)

    if (enrollmentsError) throw enrollmentsError

    const { count: cartItemsCount, error: cartError } = await supabase
      .from("cart_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("course_id", input.courseId)

    if (cartError) throw cartError

    const { data: outbox, error: outboxError } = await supabase
      .from("order_email_outbox")
      .select("status")
      .eq("order_id", input.orderId)
      .maybeSingle()

    if (outboxError) throw outboxError

    if (order.status !== "pending" && (paymentEvents?.length ?? 0) > 0) {
      return {
        order,
        paymentEvents: paymentEvents ?? [],
        enrollmentsCount: enrollmentsCount ?? 0,
        cartItemsCount: cartItemsCount ?? 0,
        outboxStatus: outbox?.status ?? null,
      }
    }

    await wait(2_000)
  }

  throw new Error(`Timed out waiting for DB settlement of ${input.reference}`)
}

export async function runWompiSandboxScenario(
  scenario: WompiScenario
): Promise<WompiScenarioResult> {
  await ensureBusinessFixtures()

  const prepared = await createScenarioOrder({
    scenario,
    amountInCents: defaultAmountInCents,
  })

  const createdTransaction = await createTransaction({
    reference: prepared.reference,
    amountInCents: defaultAmountInCents,
    customerEmail: prepared.payerEmail,
    config: scenario.config,
  })

  const finalizedTransaction = await awaitFinalTransactionStatus(createdTransaction.transactionId)
  const settled = await awaitScenarioResult(prepared)

  return {
    reference: prepared.reference,
    transactionId: createdTransaction.transactionId,
    payerEmail: prepared.payerEmail,
    wompiStatus: finalizedTransaction.status,
    order: settled.order,
    paymentEvents: settled.paymentEvents,
    enrollmentsCount: settled.enrollmentsCount,
    cartItemsCount: settled.cartItemsCount,
    outboxStatus: settled.outboxStatus,
  }
}

export async function probeWompiScenarioCapability(
  scenario: WompiScenario
): Promise<WompiCapabilityProbeResult> {
  await ensureBusinessFixtures()

  const prepared = await createScenarioOrder({
    scenario,
    amountInCents: defaultAmountInCents,
  })

  let createdTransaction: { transactionId: string }
  try {
    createdTransaction = await createTransaction({
      reference: prepared.reference,
      amountInCents: defaultAmountInCents,
      customerEmail: prepared.payerEmail,
      config: scenario.config,
    })
  } catch (error) {
    if (error instanceof UnsupportedWompiScenarioError) {
      return {
        outcome: "unsupported",
        reason: error.message,
        reference: prepared.reference,
        transactionId: null,
        orderStatus: "pending",
        paymentEventsCount: 0,
        wompiStatus: null,
      }
    }

    throw error
  }

  const deadline = Date.now() + 45_000

  while (Date.now() < deadline) {
    const transaction = await getTransactionById(createdTransaction.transactionId)
    if (transaction.status !== "PENDING") {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("status")
        .eq("id", prepared.orderId)
        .single()

      if (orderError) throw orderError

      const { count: paymentEventsCount, error: eventsError } = await supabase
        .from("payment_events")
        .select("id", { count: "exact", head: true })
        .eq("order_id", prepared.orderId)

      if (eventsError) throw eventsError

      return {
        outcome: "finalized",
        reason: null,
        reference: prepared.reference,
        transactionId: createdTransaction.transactionId,
        orderStatus: order.status,
        paymentEventsCount: paymentEventsCount ?? 0,
        wompiStatus: transaction.status,
      }
    }

    await wait(3_000)
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("status")
    .eq("id", prepared.orderId)
    .single()

  if (orderError) throw orderError

  const { count: paymentEventsCount, error: eventsError } = await supabase
    .from("payment_events")
    .select("id", { count: "exact", head: true })
    .eq("order_id", prepared.orderId)

  if (eventsError) throw eventsError

  return {
    outcome: "pending_only",
    reason: `La transaccion permanecio en PENDING sin webhook final en 45 segundos`,
    reference: prepared.reference,
    transactionId: createdTransaction.transactionId,
    orderStatus: order.status,
    paymentEventsCount: paymentEventsCount ?? 0,
    wompiStatus: "PENDING",
  }
}
