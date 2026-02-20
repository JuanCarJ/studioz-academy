import { createHash } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { createServiceRoleClient } from "@/lib/supabase/admin"
import { env } from "@/lib/env"
import { verifyWebhookSignature, type WompiWebhookEvent } from "@/lib/wompi"
import { mapWompiStatus, isValidTransition } from "@/lib/payments"

import type { Json } from "@/types/database"

export async function POST(request: NextRequest) {
  // 1. Parse body
  let body: WompiWebhookEvent
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // 2. Validate payload is an object
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  // 3. Verify signature (guards inside verifyWebhookSignature handle malformed structure)
  const eventsSecret = env.WOMPI_EVENTS_SECRET()
  let signatureValid: boolean
  try {
    signatureValid = verifyWebhookSignature(body, eventsSecret)
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 })
  }

  if (!signatureValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  // 4. Extract transaction data
  const transaction = body.data?.transaction
  if (!transaction) {
    return NextResponse.json({ error: "No transaction data" }, { status: 400 })
  }

  const { reference, status: wompiStatus, id: transactionId, payment_method_type } = transaction

  // 5. Map Wompi status to internal status
  const mappedStatus = mapWompiStatus(String(wompiStatus))
  if (!mappedStatus) {
    return NextResponse.json({ received: true, note: "Unknown status logged" })
  }

  const supabase = createServiceRoleClient()

  // 6. Idempotency: hash payload and check for duplicates
  const rawBody = JSON.stringify(body)
  const payloadHash = createHash("sha256").update(rawBody).digest("hex")

  const { data: existingEvent } = await supabase
    .from("payment_events")
    .select("id")
    .eq("payload_hash", payloadHash)
    .maybeSingle()

  if (existingEvent) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  const payloadJson = JSON.parse(rawBody) as Json

  // 7. Find order by reference
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status, user_id")
    .eq("reference", reference)
    .maybeSingle()

  if (orderError || !order) {
    return NextResponse.json(
      { error: "Order not found", reference },
      { status: 400 }
    )
  }

  // 8. Validate state transition
  const transitionValid = isValidTransition(
    order.status as Parameters<typeof isValidTransition>[0],
    mappedStatus
  )

  // 9. If transition is not valid, persist event and skip processing
  if (!transitionValid) {
    const { error: paymentEventError } = await supabase.from("payment_events").insert({
      order_id: order.id,
      source: "webhook",
      payload_hash: payloadHash,
      payload_json: payloadJson,
      external_status: wompiStatus,
      mapped_status: mappedStatus,
      wompi_transaction_id: transactionId,
      is_applied: false,
      reason: `Invalid transition: ${order.status} -> ${mappedStatus}`,
    })

    if (paymentEventError) {
      return NextResponse.json(
        { error: "Failed to persist payment event" },
        { status: 500 }
      )
    }

    return NextResponse.json({ received: true, applied: false })
  }

  // 10. If approved: create enrollments + clear cart (idempotent and retry-safe)
  if (mappedStatus === "approved" && order.user_id) {
    const { data: orderItems, error: orderItemsError } = await supabase
      .from("order_items")
      .select("course_id")
      .eq("order_id", order.id)

    if (orderItemsError) {
      return NextResponse.json(
        { error: "Failed to load order items" },
        { status: 500 }
      )
    }

    const enrollments =
      orderItems
        ?.filter((item) => item.course_id !== null)
        .map((item) => ({
          user_id: order.user_id!,
          course_id: item.course_id!,
          source: "purchase",
          order_id: order.id,
        })) ?? []

    if (enrollments.length > 0) {
      const { error: enrollmentError } = await supabase
        .from("enrollments")
        .upsert(enrollments, {
          onConflict: "user_id,course_id",
          ignoreDuplicates: true,
        })

      if (enrollmentError) {
        return NextResponse.json(
          { error: "Failed to create enrollments" },
          { status: 500 }
        )
      }
    }

    const { error: clearCartError } = await supabase
      .from("cart_items")
      .delete()
      .eq("user_id", order.user_id)

    if (clearCartError) {
      return NextResponse.json(
        { error: "Failed to clear user cart" },
        { status: 500 }
      )
    }
  }

  // 11. Update order status
  const now = new Date().toISOString()
  const updateData: Record<string, unknown> = {
    status: mappedStatus,
    wompi_transaction_id: transactionId,
    payment_method: payment_method_type ?? null,
    updated_at: now,
  }

  if (mappedStatus === "approved" && order.status !== "approved") {
    updateData.approved_at = now
  }

  const { error: updateOrderError } = await supabase
    .from("orders")
    .update(updateData)
    .eq("id", order.id)

  if (updateOrderError) {
    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 }
    )
  }

  // 12. Persist payment event after successful state application
  const { error: paymentEventError } = await supabase.from("payment_events").insert({
    order_id: order.id,
    source: "webhook",
    payload_hash: payloadHash,
    payload_json: payloadJson,
    external_status: wompiStatus,
    mapped_status: mappedStatus,
    wompi_transaction_id: transactionId,
    is_applied: true,
    reason: null,
  })

  if (paymentEventError) {
    return NextResponse.json(
      { error: "Failed to persist payment event" },
      { status: 500 }
    )
  }

  return NextResponse.json({ received: true, applied: true })
}
