import { fixtureIds } from "./fixture-ids"
import { validAdminOperation, UUID_PATTERN } from "@/lib/admin-operations"
import type { EnrolledCourseWithProgress } from "@/actions/progress"
import type { OrderSummary } from "@/actions/purchases"

export const calls: Array<{ action: string; args: unknown[] }> = []
const scenario = () => new URLSearchParams(window.location.search).get("scenario")
const pause = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms))
export const courseFixture: EnrolledCourseWithProgress = {
  course: { id: fixtureIds.course, title: "Salsa: ritmo y primeros pasos", slug: "baile", thumbnail_url: null, category: "baile", is_free: false, instructor: { full_name: "Ana Torres" }, totalLessons: 3 },
  progress: { completedLessons: 1, totalLessons: 3, percentage: 33, isCompleted: false, lastLessonId: fixtureIds.lessonOne, lastLessonTitle: "Reconoce el ritmo", newLessons: 1, hasVideoProgress: true, lastAccessedAt: "2026-09-01T12:00:00Z" },
  enrolledAt: "2026-08-01T12:00:00Z", source: "purchase",
}
export const orderFixture: OrderSummary = {
  id: fixtureIds.order, reference: "SZ-DEMO-123", status: "pending", list_subtotal: 99000, subtotal: 99000,
  course_discount_amount: 0, combo_discount_amount: 0, discount_amount: 0, discount_rule_name: null,
  total: 99000, payment_method: "CARD", created_at: "2026-09-01T12:00:00Z", approved_at: null,
  items: [{ course_title_snapshot: "Salsa: ritmo y primeros pasos", price_at_purchase: 99000, list_price_snapshot: 99000, course_discount_amount_snapshot: 0, price_after_course_discount_snapshot: 99000, combo_discount_amount_snapshot: 0, final_price_snapshot: 99000 }],
  discount_lines: [],
}
export async function getEnrolledCoursesWithProgress(input: { page?: number; filter?: string; sort?: string } = {}) {
  const completed = { ...courseFixture, course: { ...courseFixture.course, id: fixtureIds.completedCourse, title: "Dibujo para tatuaje: líneas y composición", slug: "dibujo", category: "tatuaje" as const }, progress: { ...courseFixture.progress, percentage: 100, isCompleted: true, completedLessons: 3, lastLessonId: fixtureIds.lessonThree, lastLessonTitle: "Composición final", newLessons: 0 } }
  const courses = scenario() === "courses-empty" || scenario() === "courses-error" ? [] : input.filter === "completed" ? [completed] : input.filter === "active" ? [courseFixture] : [courseFixture, completed]
  return { courses, total: courses.length, totalCourses: scenario() === "courses-empty" ? 0 : 2, completedCourses: 1, page: input.page ?? 1, pageSize: 12, ...(scenario() === "courses-error" ? { error: "No pudimos cargar tus cursos. Inténtalo de nuevo." } : {}) }
}
export async function getUserOrders() { return { orders: [orderFixture], total: 1, page: 1, pageSize: 12 } }
export async function getOrderStatusWithFallback(reference: string) {
  calls.push({ action: "payment", args: [reference] }); await pause()
  if (scenario() === "payment-error") throw new Error("Simulated offline")
  return { order: { ...orderFixture, status: "approved" } }
}
export async function getSignedVideoUrl(id: string) {
  calls.push({ action: "video", args: [id] })
  await pause(scenario() === "stale" && id === fixtureIds.lessonTwo ? 500 : 100)
  if (scenario() === "video-error") return { url: "", error: "El video está temporalmente fuera de servicio. Inténtalo más tarde." }
  return { url: window.location.origin + "/mock-video.html?lesson=" + id }
}
export async function getLastPosition() { return { position: 12 } }
export async function updateLastLesson(courseId: string, lessonId: string) { calls.push({ action: "access", args: [courseId, lessonId] }); return {} }
export async function saveVideoPosition(lessonId: string, position: number) { calls.push({ action: "position", args: [lessonId, position] }); return {} }
export async function markComplete(lessonId: string) {
  calls.push({ action: "complete", args: [lessonId] }); await pause()
  return scenario() === "progress-error" ? { error: "No pudimos guardar tu avance. Inténtalo de nuevo." } : {}
}
export async function markIncomplete(lessonId: string) { calls.push({ action: "incomplete", args: [lessonId] }); await pause(); return {} }
export async function resetCourseProgress(courseId: string, confirmed: boolean) {
  calls.push({ action: "reset", args: [courseId, confirmed] }); await pause()
  return scenario() === "reset-error" ? { error: "No pudimos reiniciar tu progreso. Inténtalo de nuevo." } : {}
}
export async function performAdminOperation(input: { action: string; targetId: string; reason: string; courseId?: string }) {
  calls.push({ action: "admin-operation", args: [input] }); await pause()
  if (!validAdminOperation(input.action, input.targetId, input.reason) || (input.action.startsWith("access.") && !UUID_PATTERN.test(input.courseId ?? ""))) return { error: "Revisa la acción, el estudiante y el curso." }
  return scenario() === "admin-error" ? { error: "No pudimos guardar el cambio. Inténtalo de nuevo." } : { success: true }
}
