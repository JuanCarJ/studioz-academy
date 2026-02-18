"use server"

export async function createLesson(moduleId: string, formData: FormData) {
  // TODO: Insert lesson, upload video to Bunny
  console.log("admin.createLesson", moduleId, Object.fromEntries(formData))
}

export async function updateLesson(lessonId: string, formData: FormData) {
  // TODO: Update lesson metadata
  console.log("admin.updateLesson", lessonId, Object.fromEntries(formData))
}

export async function reorderLessons(moduleId: string, lessonIds: string[]) {
  // TODO: Update sort_order for each lesson
  console.log("admin.reorderLessons", moduleId, lessonIds)
}
