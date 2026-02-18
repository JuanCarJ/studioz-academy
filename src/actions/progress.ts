"use server"

export async function getProgress(courseId: string) {
  // TODO: Query lesson_progress for user + course
  console.log("getProgress", courseId)
  return { percentage: 0, completedLessons: 0, totalLessons: 0 }
}

export async function updateLastLesson(courseId: string, lessonId: string) {
  // TODO: Update last_lesson_id in enrollment
  console.log("updateLastLesson", courseId, lessonId)
}
