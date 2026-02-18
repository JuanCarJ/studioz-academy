type WompiStatus = "APPROVED" | "DECLINED" | "VOIDED" | "ERROR" | "PENDING"
type OrderStatus = "approved" | "declined" | "voided" | "error" | "pending"

export function mapWompiStatus(wompiStatus: WompiStatus): OrderStatus {
  const map: Record<WompiStatus, OrderStatus> = {
    APPROVED: "approved",
    DECLINED: "declined",
    VOIDED: "voided",
    ERROR: "error",
    PENDING: "pending",
  }
  return map[wompiStatus]
}

export function isValidTransition(current: OrderStatus, next: OrderStatus): boolean {
  const validTransitions: Record<OrderStatus, OrderStatus[]> = {
    pending: ["approved", "declined", "voided", "error"],
    approved: [],
    declined: [],
    voided: [],
    error: [],
  }
  return validTransitions[current]?.includes(next) ?? false
}
