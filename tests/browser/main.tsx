import { fixtureIds } from "./fixture-ids"
import { createRoot } from "react-dom/client"
import { PlayerView } from "@/components/courses/PlayerView"
import { OperationForm } from "@/components/admin/OperationForm"
import DashboardPage from "@/app/(dashboard)/dashboard/page"
import ComprasPage from "@/app/(dashboard)/dashboard/compras/page"
import { calls, courseFixture } from "./actions"
import "@/app/globals.css"

Object.assign(window, { __studioMockCalls: calls })
// The real VideoPlayer runs against a local iframe and deterministic bridge.
window.playerjs = { Player: class {
  on(event: string, callback: (value?: unknown) => void) { if (event === "ready") queueMicrotask(callback) }
  off() {}
  setCurrentTime() {}
} }
const params = new URLSearchParams(window.location.search)
const scenario = params.get("scenario")
const completed = scenario === "player-completed" || scenario === "reset-error"
const lessons = [
  { id: fixtureIds.lessonOne, title: "Reconoce el ritmo", durationSeconds: 135, isFree: false, isCompleted: completed },
  { id: fixtureIds.lessonTwo, title: "El paso básico de salsa", durationSeconds: 242, isFree: false, isCompleted: completed, isNew: true },
  { id: fixtureIds.lessonThree, title: "Une los movimientos", durationSeconds: 185, isFree: false, isCompleted: completed },
]
const pathname = window.location.pathname
document.documentElement.classList.toggle("dark", !pathname.startsWith("/admin"))
let content
if (pathname.startsWith("/dashboard/cursos/")) {
  content = <section className="space-y-5"><a href="/dashboard" className="text-sm text-muted-foreground underline">Volver a Mi aprendizaje</a><h1 className="text-2xl font-bold">{courseFixture.course.title}</h1><PlayerView courseId={fixtureIds.course} courseTitle={courseFixture.course.title} lessons={lessons} activeLessonId={params.get("lesson") ?? fixtureIds.lessonOne} initialSignedUrl={scenario === "video-error" ? "" : window.location.origin + "/mock-video.html"} initialPlaybackMessage={scenario === "video-error" ? "El video está temporalmente fuera de servicio. Inténtalo más tarde." : ""} initialPosition={12} /></section>
} else if (pathname.startsWith("/dashboard/compras")) {
  content = await ComprasPage({ searchParams: Promise.resolve(Object.fromEntries(params)) })
} else if (pathname.startsWith("/admin")) {
  content = <section className="mx-auto max-w-xl space-y-5"><h1 className="text-2xl font-bold">Soporte del estudiante</h1><OperationForm targetId={fixtureIds.student} courses={[{ id: fixtureIds.course, title: courseFixture.course.title }]} operations={[{ value: "access.restore", label: "Restaurar acceso comprado" }, { value: "user.note", label: "Agregar nota de soporte" }]} /></section>
} else {
  content = await DashboardPage({ searchParams: Promise.resolve(Object.fromEntries(params)) })
}
createRoot(document.getElementById("root")!).render(<><header className="border-b px-4 py-3 text-sm"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3"><strong>STUDIO Z ACADEMY</strong><nav aria-label="Navegación de prueba" className="flex flex-wrap gap-4"><a href="/dashboard">Mis cursos</a><a href="/dashboard/compras">Mis compras</a><a href="/admin/soporte">Soporte</a></nav></div></header><main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{content}</main><footer className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground">Vista local de prueba · datos ficticios · sin acceso a proveedores</footer></>)
