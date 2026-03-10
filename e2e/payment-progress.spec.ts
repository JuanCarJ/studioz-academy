import { createHash } from "node:crypto"

import { expect, test } from "@playwright/test"

import { POST as handleWompiWebhook } from "../src/app/api/webhooks/wompi/route"

import type { WompiWebhookEvent } from "../src/lib/wompi"
import {
  clearUserCart,
  deleteCourseProgressForEmail,
  e2eSupabase,
  ensureBusinessFixtures,
  getCartItemsForEmail,
  getCourseById,
  getCourseProgress,
  getEnrollment,
  getProfileByEmail,
  qaCredentials,
} from "./support/db"
import { loadLocalEnv, requiredEnv } from "./support/env"

loadLocalEnv()

function buildApprovedWebhookPayload(input: {
  amountInCents: number
  currency: string
  paymentMethodType: string
  reference: string
  transactionId: string
}) {
  const signatureProperties = [
    "transaction.id",
    "transaction.status",
    "transaction.amount_in_cents",
    "transaction.reference",
  ]
  const timestamp = Date.now()
  const transaction = {
    id: input.transactionId,
    amount_in_cents: input.amountInCents,
    reference: input.reference,
    customer_email: `payer+${input.reference.toLowerCase()}@studioz-test.com`,
    currency: input.currency,
    payment_method_type: input.paymentMethodType,
    status: "APPROVED",
  }
  const values = [
    transaction.id,
    transaction.status,
    String(transaction.amount_in_cents),
    transaction.reference,
  ]
  const checksum = createHash("sha256")
    .update(`${values.join("")}${timestamp}${requiredEnv("WOMPI_EVENTS_SECRET")}`)
    .digest("hex")

  return {
    event: "transaction.updated",
    data: { transaction },
    environment: "test",
    signature: {
      properties: signatureProperties,
      checksum,
    },
    timestamp,
    sent_at: new Date(timestamp).toISOString(),
  } satisfies WompiWebhookEvent
}

test.describe.serial("payment progress initialization", () => {
  test.skip(({ isMobile }) => isMobile, "La suite muta pagos compartidos y corre en desktop.")

  test("el webhook aprobado crea course_progress para una compra sin progreso previo", async () => {
    const fixtures = await ensureBusinessFixtures()
    const profile = await getProfileByEmail(qaCredentials.userEmail)
    const course = await getCourseById(fixtures.cartCourseOneId)

    expect(profile?.authUser.id).toBeTruthy()
    expect(course?.id).toBe(fixtures.cartCourseOneId)

    const userId = profile?.authUser.id ?? ""
    const reference = `QA-WEBHOOK-${Date.now().toString(36).toUpperCase()}`
    const transactionId = `qa-webhook-${Date.now().toString(36)}`
    let orderId: string | null = null

    await e2eSupabase
      .from("enrollments")
      .delete()
      .eq("user_id", userId)
      .eq("course_id", fixtures.cartCourseOneId)
    await deleteCourseProgressForEmail({
      email: qaCredentials.userEmail,
      courseId: fixtures.cartCourseOneId,
    })

    try {
      const { data: order, error: orderError } = await e2eSupabase
        .from("orders")
        .insert({
          user_id: userId,
          reference,
          customer_name_snapshot: profile?.profile.full_name ?? "QA Student Studio Z",
          customer_email_snapshot: qaCredentials.userEmail,
          customer_phone_snapshot: profile?.profile.phone ?? null,
          list_subtotal: course?.price ?? 0,
          subtotal: course?.price ?? 0,
          course_discount_amount: 0,
          combo_discount_amount: 0,
          discount_amount: 0,
          discount_rule_id: null,
          pricing_snapshot_json: null,
          total: course?.price ?? 0,
          currency: "COP",
          status: "pending",
          cart_hash: createHash("sha256")
            .update(`${fixtures.cartCourseOneId}:${reference}`)
            .digest("hex"),
        })
        .select("id")
        .single()

      if (orderError || !order?.id) {
        throw orderError ?? new Error("Unable to create webhook order")
      }

      orderId = order.id

      const { error: itemError } = await e2eSupabase.from("order_items").insert({
        order_id: order.id,
        course_id: fixtures.cartCourseOneId,
        course_title_snapshot: course?.title ?? qaCredentials.userEmail,
        price_at_purchase: course?.price ?? 0,
        list_price_snapshot: course?.price ?? 0,
        course_discount_amount_snapshot: 0,
        price_after_course_discount_snapshot: course?.price ?? 0,
        combo_discount_amount_snapshot: 0,
        final_price_snapshot: course?.price ?? 0,
      })

      if (itemError) {
        throw itemError
      }

      const payload = buildApprovedWebhookPayload({
        amountInCents: course?.price ?? 0,
        currency: "COP",
        paymentMethodType: "CARD",
        reference,
        transactionId,
      })
      const response = await handleWompiWebhook(
        new Request("http://localhost/api/webhooks/wompi", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }) as never
      )

      expect(response.status).toBe(200)
      await expect
        .poll(async () => {
          const progress = await getCourseProgress(
            qaCredentials.userEmail,
            fixtures.cartCourseOneId
          )
          return progress
            ? `${progress.completed_lessons}|${progress.is_completed}|${progress.course_id}`
            : null
        })
        .toBe(`0|false|${fixtures.cartCourseOneId}`)

      const enrollment = await getEnrollment(
        qaCredentials.userEmail,
        fixtures.cartCourseOneId
      )

      expect(enrollment?.source).toBe("purchase")
      expect(enrollment?.order_id).toBe(order.id)
    } finally {
      await e2eSupabase
        .from("course_progress")
        .delete()
        .eq("user_id", userId)
        .eq("course_id", fixtures.cartCourseOneId)
      await e2eSupabase
        .from("enrollments")
        .delete()
        .eq("user_id", userId)
        .eq("course_id", fixtures.cartCourseOneId)

      if (orderId) {
        await e2eSupabase.from("order_email_outbox").delete().eq("order_id", orderId)
        await e2eSupabase.from("payment_events").delete().eq("order_id", orderId)
        await e2eSupabase.from("order_items").delete().eq("order_id", orderId)
        await e2eSupabase.from("orders").delete().eq("id", orderId)
      }
    }
  })

  test("el webhook aprobado conserva cursos ajenos a la orden en el carrito", async () => {
    const fixtures = await ensureBusinessFixtures()
    const profile = await getProfileByEmail(qaCredentials.userEmail)
    const purchasedCourse = await getCourseById(fixtures.cartCourseOneId)
    const extraCourse = await getCourseById(fixtures.cartCourseTwoId)

    expect(profile?.authUser.id).toBeTruthy()
    expect(purchasedCourse?.id).toBe(fixtures.cartCourseOneId)
    expect(extraCourse?.id).toBe(fixtures.cartCourseTwoId)

    const userId = profile?.authUser.id ?? ""
    const reference = `QA-WEBHOOK-CART-${Date.now().toString(36).toUpperCase()}`
    const transactionId = `qa-webhook-cart-${Date.now().toString(36)}`
    let orderId: string | null = null

    await clearUserCart(qaCredentials.userEmail)

    try {
      await e2eSupabase.from("cart_items").insert([
        { user_id: userId, course_id: fixtures.cartCourseOneId },
        { user_id: userId, course_id: fixtures.cartCourseTwoId },
      ])

      const { data: order, error: orderError } = await e2eSupabase
        .from("orders")
        .insert({
          user_id: userId,
          reference,
          customer_name_snapshot: profile?.profile.full_name ?? "QA Student Studio Z",
          customer_email_snapshot: qaCredentials.userEmail,
          customer_phone_snapshot: profile?.profile.phone ?? null,
          list_subtotal: purchasedCourse?.price ?? 0,
          subtotal: purchasedCourse?.price ?? 0,
          course_discount_amount: 0,
          combo_discount_amount: 0,
          discount_amount: 0,
          discount_rule_id: null,
          pricing_snapshot_json: null,
          total: purchasedCourse?.price ?? 0,
          currency: "COP",
          status: "pending",
          cart_hash: createHash("sha256")
            .update(`${fixtures.cartCourseOneId}:${reference}`)
            .digest("hex"),
        })
        .select("id")
        .single()

      if (orderError || !order?.id) {
        throw orderError ?? new Error("Unable to create cart preservation order")
      }

      orderId = order.id

      const { error: itemError } = await e2eSupabase.from("order_items").insert({
        order_id: order.id,
        course_id: fixtures.cartCourseOneId,
        course_title_snapshot: purchasedCourse?.title ?? "Purchased Course",
        price_at_purchase: purchasedCourse?.price ?? 0,
        list_price_snapshot: purchasedCourse?.price ?? 0,
        course_discount_amount_snapshot: 0,
        price_after_course_discount_snapshot: purchasedCourse?.price ?? 0,
        combo_discount_amount_snapshot: 0,
        final_price_snapshot: purchasedCourse?.price ?? 0,
      })

      if (itemError) {
        throw itemError
      }

      const payload = buildApprovedWebhookPayload({
        amountInCents: purchasedCourse?.price ?? 0,
        currency: "COP",
        paymentMethodType: "CARD",
        reference,
        transactionId,
      })

      const response = await handleWompiWebhook(
        new Request("http://localhost/api/webhooks/wompi", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }) as never
      )

      expect(response.status).toBe(200)

      await expect
        .poll(async () => (await getCartItemsForEmail(qaCredentials.userEmail)).map((item) => item.course_id))
        .toEqual([fixtures.cartCourseTwoId])
    } finally {
      await clearUserCart(qaCredentials.userEmail)
      await e2eSupabase
        .from("enrollments")
        .delete()
        .eq("user_id", userId)
        .eq("course_id", fixtures.cartCourseOneId)
      await e2eSupabase
        .from("course_progress")
        .delete()
        .eq("user_id", userId)
        .eq("course_id", fixtures.cartCourseOneId)

      if (orderId) {
        await e2eSupabase.from("order_email_outbox").delete().eq("order_id", orderId)
        await e2eSupabase.from("payment_events").delete().eq("order_id", orderId)
        await e2eSupabase.from("order_items").delete().eq("order_id", orderId)
        await e2eSupabase.from("orders").delete().eq("id", orderId)
      }
    }
  })
})
