"use server"

export async function getSignedVideoUrl(lessonId: string) {
  // TODO: Verify enrollment, generate Bunny signed URL
  console.log("getSignedVideoUrl", lessonId)
  return { url: "" }
}

export async function markComplete(lessonId: string) {
  // TODO: Upsert lesson_progress, recalculate course %
  console.log("markComplete", lessonId)
}
