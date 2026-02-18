"use server"

export async function createCourse(formData: FormData) {
  // TODO: Validate admin role, insert course in Supabase
  console.log("admin.createCourse", Object.fromEntries(formData))
}

export async function updateCourse(courseId: string, formData: FormData) {
  // TODO: Validate admin, update course
  console.log("admin.updateCourse", courseId, Object.fromEntries(formData))
}

export async function deleteCourse(courseId: string) {
  // TODO: Soft delete course, check active enrollments
  console.log("admin.deleteCourse", courseId)
}
