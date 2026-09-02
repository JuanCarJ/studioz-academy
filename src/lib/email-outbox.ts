import "server-only"
import { randomUUID } from "node:crypto"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { paymentRpc } from "@/lib/payment-rpc"
import { sendEmail } from "@/lib/resend"
import { formatCOP } from "@/lib/utils"
import { PurchaseConfirmation } from "@/emails/PurchaseConfirmation"
import { env } from "@/lib/env"

function formatPaymentMethod(method: string | null): string | null {
  if (!method) return null

  const labels: Record<string, string> = {
    CARD: "Tarjeta",
    NEQUI: "Nequi",
    PSE: "PSE",
    BANCOLOMBIA_TRANSFER: "Bancolombia",
    BANCOLOMBIA_COLLECT: "Bancolombia Collect",
    EFECTY: "Efecty",
    PROMO: "Promocion interna",
  }

  return labels[method.toUpperCase()] ?? method
}

/**
 * Send a purchase confirmation email for a specific order.
 * Returns true if sent successfully.
 */
async function sendPurchaseConfirmation(orderId: string, idempotencyKey: string): Promise<boolean> {
  const supabase = createServiceRoleClient()

  // Fetch order with items
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*, items:order_items(*), discount_lines:order_discount_lines(*)")
    .eq("id", orderId)
    .single()

  if (orderError || !order || order.status !== "approved" || order.is_user_anonymized || !order.customer_email_snapshot.includes("@")) {
    console.error(
      JSON.stringify({
        scope: "email.sendPurchaseConfirmation.orderNotFound",
        orderId,
      })
    )
    return false
  }

  const appUrl = env.APP_URL()
  const items = (order.items as Array<{
    course_title_snapshot: string
    list_price_snapshot?: number | null
    price_at_purchase: number
    course_discount_amount_snapshot?: number | null
    combo_discount_amount_snapshot?: number | null
    final_price_snapshot?: number | null
  }> | null) ?? []
  const discountLines = (order.discount_lines as Array<{
    kind: "course_discount" | "combo"
    source_name_snapshot: string
    course_title_snapshot: string | null
    amount: number
  }> | null) ?? []
  const groupedLines = discountLines.reduce<Array<{ key: string; label: string; amount: number }>>(
    (acc, line) => {
      const label =
        line.kind === "course_discount"
          ? `Promo curso: ${line.course_title_snapshot ?? line.source_name_snapshot}`
          : `Combo: ${line.source_name_snapshot}`
      const key = `${line.kind}:${label}`
      const existing = acc.find((entry) => entry.key === key)
      if (existing) {
        existing.amount += line.amount
        return acc
      }
      acc.push({ key, label, amount: line.amount })
      return acc
    },
    []
  )

  const result = await sendEmail({
    idempotencyKey,
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
      listSubtotalFormatted: formatCOP(order.list_subtotal ?? order.subtotal),
      courseDiscountFormatted:
        order.course_discount_amount > 0 ? formatCOP(order.course_discount_amount) : null,
      comboDiscountFormatted:
        order.combo_discount_amount > 0 ? formatCOP(order.combo_discount_amount) : null,
      totalDiscountFormatted:
        order.discount_amount > 0 ? formatCOP(order.discount_amount) : null,
      totalFormatted: formatCOP(order.total),
      paymentMethod: formatPaymentMethod(order.payment_method),
      items: items.map((item) => ({
        title: item.course_title_snapshot,
        listPriceFormatted: formatCOP(item.list_price_snapshot ?? item.price_at_purchase),
        courseDiscountFormatted:
          (item.course_discount_amount_snapshot ?? 0) > 0
            ? formatCOP(item.course_discount_amount_snapshot ?? 0)
            : null,
        comboDiscountFormatted:
          (item.combo_discount_amount_snapshot ?? 0) > 0
            ? formatCOP(item.combo_discount_amount_snapshot ?? 0)
            : null,
        finalPriceFormatted: formatCOP(item.final_price_snapshot ?? item.price_at_purchase),
      })),
      discountLines: groupedLines.map((line) => ({
        label: line.label,
        amountFormatted: formatCOP(line.amount),
      })),
      dashboardUrl: `${appUrl}/dashboard`,
    }),
  })

  console.info(
    JSON.stringify({
      scope: "email.sendPurchaseConfirmation",
      orderId,
      reference: order.reference,
      sent: result !== null,
    })
  )

  return result !== null
}


export async function enqueuePurchaseConfirmation(orderId: string, resend = false): Promise<void> {
  await paymentRpc(createServiceRoleClient(), "enqueue_purchase_email", { p_order_id: orderId, p_resend: resend })
}

interface ClaimedEmail { id: string; order_id: string; delivery_version: number }
export async function processEmailOutboxBatch(batchSize = 5): Promise<{ processed: number; sent: number; failed: number }> {
  const client = createServiceRoleClient()
  const token = randomUUID()
  const entries = await paymentRpc<ClaimedEmail[]>(client, "claim_email_outbox", {
    p_limit: Math.max(1, Math.min(5, Math.floor(batchSize))), p_token: token,
  })
  let sent = 0
  let failed = 0
  for (const entry of entries) {
    let success = false
    try { success = await sendPurchaseConfirmation(entry.order_id, `purchase/${entry.id}/v${entry.delivery_version}`) }
    catch { /* Ambiguous provider response: retry with the same provider key. */ }
    const finished = await paymentRpc<boolean>(client, "finish_email_outbox", {
      p_id: entry.id, p_token: token, p_sent: success, p_delivery_version: entry.delivery_version,
    })
    if (success && finished) sent++
    else failed++
  }
  return { processed: entries.length, sent, failed }
}
