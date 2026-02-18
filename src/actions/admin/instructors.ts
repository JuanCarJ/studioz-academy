"use server"

export async function createInstructor(formData: FormData) {
  // TODO: Insert instructor profile
  console.log("admin.createInstructor", Object.fromEntries(formData))
}

export async function updateInstructor(instructorId: string, formData: FormData) {
  // TODO: Update instructor profile
  console.log("admin.updateInstructor", instructorId, Object.fromEntries(formData))
}
