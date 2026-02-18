"use server"

export async function createReview(courseId: string, rating: number, comment: string) {
  // TODO: Insert review, validate enrollment
  console.log("createReview", courseId, rating, comment)
}

export async function updateReview(reviewId: string, rating: number, comment: string) {
  // TODO: Update own review
  console.log("updateReview", reviewId, rating, comment)
}

export async function deleteReview(reviewId: string) {
  // TODO: Soft delete own review
  console.log("deleteReview", reviewId)
}

export async function getCourseReviews(courseId: string) {
  // TODO: Query reviews for course with pagination
  console.log("getCourseReviews", courseId)
  return []
}
