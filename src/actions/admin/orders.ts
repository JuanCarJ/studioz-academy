"use server"

export async function getOrders(filters?: { status?: string; dateFrom?: string }) {
  // TODO: Query orders with filters and pagination
  console.log("admin.getOrders", filters)
  return []
}

export async function getOrderDetail(orderId: string) {
  // TODO: Query order with items + user + payment info
  console.log("admin.getOrderDetail", orderId)
  return null
}

export async function resendPurchaseEmail(orderId: string) {
  // TODO: Re-send purchase confirmation email
  console.log("admin.resendPurchaseEmail", orderId)
}
