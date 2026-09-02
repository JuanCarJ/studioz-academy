import { fixtureIds } from "./fixture-ids"
import { test, expect, type Page } from "@playwright/test"
import { resolve } from "node:path"
const axePath = resolve("node_modules/axe-core/axe.min.js")

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url())
    return url.hostname === "127.0.0.1" && url.port === "4177" ? route.continue() : route.abort()
  })
})
async function accessibility(page: Page) {
  // Contrast is measured after finite UI transitions, never mid fade/overlay.
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})))
  })
  await page.addScriptTag({ path: axePath })
  const violations = await page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (node: Document, options: object) => Promise<{ violations: Array<{ id: string; impact: string; nodes: unknown[] }> }> } }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })
    return result.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes }))
  })
  expect(violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}
test("course filters, resume, completion and confirmed reset", async ({ page }, info) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/dashboard")
  await expect(page.getByRole("heading", { name: "Mi aprendizaje" })).toBeVisible()
  await accessibility(page)
  await page.screenshot({ path: `output/playwright/student-${info.project.name}-courses.png`, fullPage: true })
  await page.getByRole("link", { name: "Completados (1)" }).click()
  await expect(page.getByRole("link", { name: /Repasar:/ })).toBeVisible()
  await page.getByRole("link", { name: "Por completar (1)" }).click()
  await page.getByRole("link", { name: /Continuar: Salsa/ }).click()
  await expect(page.getByRole("heading", { name: "Reconoce el ritmo", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Marcar como completada" }).click()
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "33")
  await page.getByRole("button", { name: "Reiniciar progreso", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await accessibility(page)
  await page.getByRole("button", { name: "Conservar mi progreso" }).click()
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "33")
  await page.getByRole("button", { name: "Reiniciar progreso", exact: true }).click()
  await page.getByRole("button", { name: "Sí, reiniciar progreso" }).click()
  await expect(page.getByRole("dialog")).not.toBeVisible()
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0")
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Ver lecciones" }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await accessibility(page)
  }
  await page.getByRole("button", { name: "2. El paso básico de salsa" }).click()
  await expect(page.getByRole("heading", { name: "El paso básico de salsa", exact: true })).toBeVisible()
  await expect(page.getByTitle("Reproductor del curso")).toHaveAttribute("src", new RegExp("lesson=" + fixtureIds.lessonTwo))
  await accessibility(page)
  await page.screenshot({ path: `output/playwright/student-${info.project.name}-player.png`, fullPage: true })
  expect(errors).toEqual([])
})
test("course and video errors have actionable recovery", async ({ page }) => {
  await page.goto("/dashboard?scenario=courses-error")
  await expect(page.getByRole("alert")).toContainText("No pudimos cargar")
  await accessibility(page)
  await page.goto("/dashboard/cursos/baile?scenario=video-error")
  await expect(page.getByRole("button", { name: "Volver a cargar la lección" })).toBeVisible()
  await accessibility(page)
  await page.goto("/dashboard/cursos/baile?scenario=progress-error")
  await page.getByRole("button", { name: "Marcar como completada" }).click()
  await expect(page.getByRole("alert")).toContainText("No pudimos guardar")
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0")
})
test("purchase expansion and payment recovery retain human context", async ({ page }, info) => {
  await page.goto("/dashboard/compras?scenario=payment-error")
  await page.getByRole("button", { expanded: false }).click()
  await page.getByRole("button", { name: "Consultar mi pago" }).click()
  await expect(page.getByRole("status")).toContainText("Revisa tu conexión")
  await accessibility(page)
  await page.screenshot({ path: `output/playwright/student-${info.project.name}-purchase.png`, fullPage: true })
})
test("admin support validates reason, course and confirmation", async ({ page }, info) => {
  await page.goto("/admin/soporte")
  await expect(page.getByLabel("Acción", { exact: true })).toHaveValue("access.restore")
  await expect(page.getByRole("option", { name: "Restaurar acceso comprado" })).toHaveCount(1)
  await page.getByLabel("Curso", { exact: true }).selectOption(fixtureIds.course)
  await page.getByLabel("Motivo del cambio").fill("Restauración de acceso solicitada por el estudiante.")
  await page.getByRole("checkbox").check()
  await page.getByRole("button", { name: "Guardar cambio" }).click()
  await expect(page.getByRole("status")).toContainText("Cambio guardado")
  await accessibility(page)
  await page.screenshot({ path: `output/playwright/student-${info.project.name}-support.png`, fullPage: true })
})
