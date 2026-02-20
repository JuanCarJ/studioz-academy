export type WompiStatus = "APPROVED" | "DECLINED" | "VOIDED" | "ERROR" | "PENDING"
export type OrderStatus =
  | "pending"
  | "approved"
  | "declined"
  | "voided"
  | "refunded"
  | "chargeback"

// H-10: Expanded to include refunded and chargeback as valid mapped statuses.
// Wompi doesn't send these via webhook directly, but they can appear in the
// transactions API response or be triggered by manual operations.
export type WebhookOrderStatus =
  | "pending"
  | "approved"
  | "declined"
  | "voided"
  | "refunded"
  | "chargeback"

const WOMPI_STATUS_MAP: Record<WompiStatus, WebhookOrderStatus> = {
  APPROVED: "approved",
  DECLINED: "declined",
  VOIDED: "voided",
  ERROR: "declined",
  PENDING: "pending",
}

export function mapWompiStatus(wompiStatus: string): WebhookOrderStatus | null {
  const normalizedStatus = wompiStatus.toUpperCase() as WompiStatus
  if (!(normalizedStatus in WOMPI_STATUS_MAP)) {
    return null
  }

  return WOMPI_STATUS_MAP[normalizedStatus]
}

export function isValidTransition(
  current: OrderStatus,
  next: WebhookOrderStatus
): boolean {
  const validTransitions: Record<OrderStatus, WebhookOrderStatus[]> = {
    pending: ["pending", "approved", "declined", "voided"],
    // Self-transitions allowed for idempotent webhook retries.
    // H-10: approved can transition to refunded or chargeback per CA-022.6.
    approved: ["approved", "refunded", "chargeback"],
    declined: ["declined"],
    voided: ["voided"],
    // Terminal states — no transitions out
    refunded: [],
    chargeback: [],
  }
  return validTransitions[current]?.includes(next) ?? false
}
