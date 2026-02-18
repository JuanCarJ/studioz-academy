"use server"

export async function createCombo(formData: FormData) {
  // TODO: Insert combo + combo_items
  console.log("admin.createCombo", Object.fromEntries(formData))
}

export async function updateCombo(comboId: string, formData: FormData) {
  // TODO: Update combo details
  console.log("admin.updateCombo", comboId, Object.fromEntries(formData))
}
