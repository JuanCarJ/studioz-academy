import type { OrderStatus } from "@/lib/payments"

export interface PaymentReturnOrder { reference: string; status: OrderStatus; total: number; currency: string }
export interface PaymentReturnItem { courseTitle: string; courseSlug: string }
export interface BoldCheckoutConfig {
  orderId: string; amount: string; currency: "COP"; apiKey: string; integritySignature: string
  description: string; redirectionUrl: string; originUrl: string
}
export interface PaymentEvent {
  provider: "bold" | "wompi"; environment: "sandbox" | "production" | "legacy"
  eventId: string; reference: string; transactionId: string; status: string
  amountInCents: number; currency: string; paymentMethod: string | null
  source: "webhook" | "polling" | "reconciliation"
}
