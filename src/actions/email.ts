"use server"

export async function sendPurchaseConfirmation(orderId: string) {
  // TODO: Fetch order details, render React Email, send via Resend
  console.log("sendPurchaseConfirmation", orderId)
}

export async function sendNewCourseNotification(courseId: string) {
  // TODO: Fetch all users, render email, send via Resend
  console.log("sendNewCourseNotification", courseId)
}
