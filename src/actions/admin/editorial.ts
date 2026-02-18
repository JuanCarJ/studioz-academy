"use server"

// Noticias
export async function createNews(formData: FormData) {
  console.log("admin.createNews", Object.fromEntries(formData))
}

export async function updateNews(newsId: string, formData: FormData) {
  console.log("admin.updateNews", newsId, Object.fromEntries(formData))
}

export async function deleteNews(newsId: string) {
  console.log("admin.deleteNews", newsId)
}

// Eventos
export async function createEvent(formData: FormData) {
  console.log("admin.createEvent", Object.fromEntries(formData))
}

export async function updateEvent(eventId: string, formData: FormData) {
  console.log("admin.updateEvent", eventId, Object.fromEntries(formData))
}

export async function deleteEvent(eventId: string) {
  console.log("admin.deleteEvent", eventId)
}

// Galeria
export async function createGalleryImage(formData: FormData) {
  console.log("admin.createGalleryImage", Object.fromEntries(formData))
}

export async function deleteGalleryImage(imageId: string) {
  console.log("admin.deleteGalleryImage", imageId)
}
