export const CATEGORIES = ["baile", "tatuaje"] as const

export type Category = (typeof CATEGORIES)[number]

export const ROLES = {
  USER: "user",
  ADMIN: "admin",
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const ORDER_STATUSES = [
  "pending",
  "approved",
  "declined",
  "voided",
  "refunded",
  "chargeback",
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ENROLLMENT_SOURCES = ["purchase", "free"] as const

export type EnrollmentSource = (typeof ENROLLMENT_SOURCES)[number]
