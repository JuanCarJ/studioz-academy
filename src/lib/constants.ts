export const CATEGORIES = [
  "baile",
  "tatuaje",
  "piercing",
  "maquillaje",
] as const

export type Category = (typeof CATEGORIES)[number]

export const ROLES = {
  STUDENT: "student",
  ADMIN: "admin",
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const ORDER_STATUSES = [
  "pending",
  "approved",
  "declined",
  "voided",
  "error",
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]
