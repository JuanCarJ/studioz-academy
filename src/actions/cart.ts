"use server"

export async function addToCart(courseId: string) {
  // TODO: Insert into cart (cookie or DB)
  console.log("addToCart", courseId)
}

export async function removeFromCart(courseId: string) {
  // TODO: Remove from cart
  console.log("removeFromCart", courseId)
}

export async function getCart() {
  // TODO: Return cart items with course details
  return []
}
