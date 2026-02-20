export type WompiStatus = "APPROVED" | "DECLINED" | "VOIDED" | "ERROR" | "PENDING"
export type OrderStatus =
  | "pending"
  | "approved"
  | "declined"
  | "voided"
  | "refunded"
  | "chargeback"
type WebhookOrderStatus = "pending" | "approved" | "declined" | "voided"

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
    // Self-transitions are allowed for idempotent webhook retries.
    approved: ["approved"],
    declined: ["declined"],
    voided: ["voided"],
    refunded: [],
    chargeback: [],
  }
  return validTransitions[current]?.includes(next) ?? false
}
