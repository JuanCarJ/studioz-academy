"use server"

import { createServiceRoleClient } from "@/lib/supabase/admin"
import { sendEmail } from "@/lib/resend"
import { formatCOP } from "@/lib/utils"
import { PurchaseConfirmation } from "@/emails/PurchaseConfirmation"
import { env } from "@/lib/env"

const MAX_ATTEMPTS = 5
const RETRY_DELAY_MS = [60_000, 120_000, 300_000, 600_000, 1_200_000] // 1m, 2m, 5m, 10m, 20m

/**
 * Enqueue a purchase confirmation email in the outbox.
 * Called from the webhook after successful payment — must be idempotent.
 * Does NOT block the webhook response.
 */
export async function enqueuePurchaseConfirmation(orderId: string): Promise<void> {
  const supabase = createServiceRoleClient()

  // Idempotent: order_id is UNIQUE in outbox, so duplicate inserts are ignored
  const { error } = await supabase
    .from("order_email_outbox")
    .upsert(
      {
        order_id: orderId,
        email_type: "purchase_confirmation",
        status: "pending",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
      },
      { onConflict: "order_id", ignoreDuplicates: true }
    )

  if (error) {
    console.error("[email] Failed to enqueue purchase confirmation:", error)
  }
}

/**
 * Send a purchase confirmation email for a specific order.
 * Returns true if sent successfully.
 */
export async function sendPurchaseConfirmation(orderId: string): Promise<boolean> {
  const supabase = createServiceRoleClient()

  // Fetch order with items
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*, items:order_items(*)")
    .eq("id", orderId)
    .single()

  if (orderError || !order) {
    console.error("[email] Order not found:", orderId, orderError)
    return false
  }

  const appUrl = env.APP_URL()

  const result = await sendEmail({
    to: order.customer_email_snapshot,
    subject: `Confirmacion de compra - ${order.reference}`,
    react: PurchaseConfirmation({
      customerName: order.customer_name_snapshot,
      orderReference: order.reference,
      orderDate: new Date(order.created_at).toLocaleDateString("es-CO", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      subtotalFormatted: formatCOP(order.subtotal),
      discountFormatted: order.discount_amount > 0 ? formatCOP(order.discount_amount) : null,
      totalFormatted: formatCOP(order.total),
      paymentMethod: order.payment_method,
      courseNames: (order.items as { course_title_snapshot: string }[]).map(
        (item) => item.course_title_snapshot
      ),
      dashboardUrl: `${appUrl}/dashboard`,
    }),
  })

  return result !== null
}

/**
 * Send a new course notification email (placeholder for Inc 4+).
 */
export async function sendNewCourseNotification(courseId: string) {
  // TODO: Implement in Increment 4+ (US-039)
  console.log("sendNewCourseNotification", courseId)
}

/**
 * Process pending emails from the outbox.
 * Called by the cron job every 5 minutes.
 * Processes up to `batchSize` pending entries.
 */
export async function processEmailOutboxBatch(batchSize = 10): Promise<{
  processed: number
  sent: number
  failed: number
}> {
  const supabase = createServiceRoleClient()

  // Fetch pending entries where next_attempt_at <= now
  const { data: entries, error } = await supabase
    .from("order_email_outbox")
    .select("*")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(batchSize)

  if (error || !entries) {
    console.error("[email] Failed to fetch outbox entries:", error)
    return { processed: 0, sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0

  for (const entry of entries) {
    try {
      const success = await sendPurchaseConfirmation(entry.order_id)

      if (success) {
        // Mark as sent
        await supabase
          .from("order_email_outbox")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            attempts: entry.attempts + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", entry.id)

        sent++
      } else {
        const newAttempts = entry.attempts + 1
        const isFinalAttempt = newAttempts >= MAX_ATTEMPTS

        if (isFinalAttempt) {
          // Mark as failed after max retries
          await supabase
            .from("order_email_outbox")
            .update({
              status: "failed",
              attempts: newAttempts,
              last_error: "Max retries exceeded",
              updated_at: new Date().toISOString(),
            })
            .eq("id", entry.id)

          failed++
        } else {
          // Schedule next retry with exponential backoff
          const delayMs = RETRY_DELAY_MS[newAttempts - 1] ?? RETRY_DELAY_MS[RETRY_DELAY_MS.length - 1]
          const nextAttempt = new Date(Date.now() + delayMs).toISOString()

          await supabase
            .from("order_email_outbox")
            .update({
              attempts: newAttempts,
              next_attempt_at: nextAttempt,
              last_error: "Send failed, will retry",
              updated_at: new Date().toISOString(),
            })
            .eq("id", entry.id)
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error"
      const newAttempts = entry.attempts + 1
      const isFinalAttempt = newAttempts >= MAX_ATTEMPTS

      await supabase
        .from("order_email_outbox")
        .update({
          status: isFinalAttempt ? "failed" : "pending",
          attempts: newAttempts,
          last_error: errorMessage,
          next_attempt_at: isFinalAttempt
            ? undefined
            : new Date(
                Date.now() + (RETRY_DELAY_MS[newAttempts - 1] ?? RETRY_DELAY_MS[RETRY_DELAY_MS.length - 1])
              ).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", entry.id)

      failed++
    }
  }

  return { processed: entries.length, sent, failed }
}
