"use server"

export async function listReviews(filters?: { courseId?: string; status?: string }) {
  // TODO: Query reviews for moderation
  console.log("admin.listReviews", filters)
  return []
}

export async function moderateReview(reviewId: string, approved: boolean) {
  // TODO: Update review status
  console.log("admin.moderateReview", reviewId, approved)
}

export async function deleteReview(reviewId: string) {
  // TODO: Hard delete review (admin only)
  console.log("admin.deleteReview", reviewId)
}
