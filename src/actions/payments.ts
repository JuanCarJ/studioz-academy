"use server"

export async function getOrderStatusWithFallback(reference: string) {
  // TODO: Check DB first, then Wompi API if still pending
  console.log("getOrderStatusWithFallback", reference)
  return { status: "pending" as const }
}

export async function reconcilePendingOrders() {
  // TODO: Query orders with status pending > 15 min
  // TODO: Check Wompi API for each, update DB
  return { reconciled: 0 }
}
