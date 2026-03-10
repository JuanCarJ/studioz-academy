import { expect, test } from "@playwright/test"

import { loginAsUser } from "./support/auth"
import {
  ensureBusinessFixtures,
  getCourseBySlug,
  getReviewForCourse,
  qaCredentials,
  qaFixtures,
  e2eSupabase,
} from "./support/db"
import { installBunnyPlayerStub, waitForPlayerReady } from "./support/player"

const runId = Date.now().toString(36)

// ── Header direct links ──────────────────────────────────────────────────────

test.describe("header direct links (desktop)", () => {
  test.skip(({ isMobile }) => isMobile, "Links directos solo visibles en desktop.")

  test.beforeAll(async () => {
    await ensureBusinessFixtures()
  })

  test("muestra links directos de Mi Aprendizaje y Mis Compras cuando el usuario esta autenticado", async ({
    page,
  }) => {
    await loginAsUser(page)
    await page.goto("/cursos")

    const headerAprendizaje = page.getByRole("link", { name: /mi aprendizaje/i }).first()
    const headerCompras = page.getByRole("link", { name: /mis compras/i }).first()

    await expect(headerAprendizaje).toBeVisible()
    await expect(headerCompras).toBeVisible()

    await expect(headerAprendizaje).toHaveAttribute("href", "/dashboard")
    await expect(headerCompras).toHaveAttribute("href", "/dashboard/compras")
  })

  test("links directos navegan correctamente al dashboard y compras", async ({
    page,
  }) => {
    await loginAsUser(page)
    await page.goto("/cursos")

    await page.getByRole("link", { name: /mi aprendizaje/i }).first().click()
    await expect(page).toHaveURL(/\/dashboard$/)

    await page.goto("/cursos")
    await page.getByRole("link", { name: /mis compras/i }).first().click()
    await expect(page).toHaveURL(/\/dashboard\/compras/)
  })

  test("dropdown del avatar mantiene los links redundantes", async ({
    page,
  }) => {
    await loginAsUser(page)
    await page.goto("/cursos")

    await page.getByRole("button", { name: /abrir menu de usuario/i }).click()

    const dropdownAprendizaje = page.getByRole("menuitem").filter({ hasText: /mi aprendizaje/i })
    const dropdownCompras = page.getByRole("menuitem").filter({ hasText: /mis compras/i })

    await expect(dropdownAprendizaje).toBeVisible()
    await expect(dropdownCompras).toBeVisible()
  })

  test("no muestra links directos para visitantes no autenticados", async ({
    page,
  }) => {
    await page.goto("/cursos")

    await expect(
      page.getByRole("link", { name: /mi aprendizaje/i })
    ).toHaveCount(0)
    await expect(
      page.getByRole("link", { name: /mis compras/i })
    ).toHaveCount(0)

    await expect(
      page.getByRole("link", { name: /iniciar sesion/i })
    ).toBeVisible()
  })
})

// ── ReviewSection in dashboard player ────────────────────────────────────────

test.describe.serial("resenas en dashboard player", () => {
  test.skip(({ isMobile }) => isMobile, "Suite muta DB compartida y corre en desktop.")

  const reviewText = `QA E2E dashboard review ${runId}`
  const reviewTextEdited = `QA E2E dashboard review editada ${runId}`

  test.beforeAll(async () => {
    await ensureBusinessFixtures()

    // Clean up any existing review for this user+course
    const paidCourse = await getCourseBySlug(qaFixtures.paidPrimaryCourseSlug)
    if (paidCourse) {
      const existing = await getReviewForCourse(qaCredentials.userEmail, paidCourse.id)
      if (existing) {
        await e2eSupabase.from("reviews").delete().eq("id", existing.id)
      }
    }
  })

  test.beforeEach(async ({ page }) => {
    await installBunnyPlayerStub(page)
  })

  test("muestra seccion de resenas en la pagina del player del dashboard", async ({
    page,
  }) => {
    await loginAsUser(page)
    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
    await waitForPlayerReady(page)

    await expect(
      page.getByRole("heading", { name: /reseñas/i })
    ).toBeVisible()

    // Student is enrolled, so the review form should appear
    await expect(
      page.getByText(/deja tu reseña/i)
    ).toBeVisible()
  })

  test("crea resena desde el dashboard player con verificacion en DB", async ({
    page,
  }) => {
    const paidCourse = await getCourseBySlug(qaFixtures.paidPrimaryCourseSlug)
    expect(paidCourse?.id).toBeTruthy()

    await loginAsUser(page)
    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
    await waitForPlayerReady(page)

    await page.getByRole("radio", { name: /5 estrellas/i }).click()
    await page.getByLabel(/comentario/i).fill(reviewText)
    await page.getByRole("button", { name: /publicar reseña/i }).click()

    await expect(page.getByText(/tu reseña fue publicada/i)).toBeVisible()

    // Verify in DB
    await expect
      .poll(async () =>
        getReviewForCourse(qaCredentials.userEmail, paidCourse!.id).then(
          (review) => review?.text ?? null
        )
      )
      .toBe(reviewText)
  })

  test("resena creada en dashboard aparece en la pagina publica del curso", async ({
    page,
  }) => {
    await page.goto(`/cursos/${qaFixtures.paidPrimaryCourseSlug}`)

    await expect(page.getByText(reviewText)).toBeVisible()
  })

  test("actualiza resena desde el dashboard player con verificacion en DB", async ({
    page,
  }) => {
    const paidCourse = await getCourseBySlug(qaFixtures.paidPrimaryCourseSlug)
    expect(paidCourse?.id).toBeTruthy()

    await loginAsUser(page)
    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
    await waitForPlayerReady(page)

    // Form should show "Tu reseña" (editing mode)
    await expect(page.getByText(/tu reseña$/i)).toBeVisible()

    await page.getByRole("radio", { name: /3 estrellas/i }).click()
    await page.getByLabel(/comentario/i).fill(reviewTextEdited)
    await page.getByRole("button", { name: /guardar cambios/i }).click()

    await expect(page.getByText(/tu reseña fue actualizada/i)).toBeVisible()

    // Verify in DB
    await expect
      .poll(async () =>
        getReviewForCourse(qaCredentials.userEmail, paidCourse!.id).then(
          (review) => `${review?.rating ?? 0}|${review?.text ?? ""}`
        )
      )
      .toBe(`3|${reviewTextEdited}`)
  })

  test("elimina resena desde el dashboard player con verificacion en DB", async ({
    page,
  }) => {
    const paidCourse = await getCourseBySlug(qaFixtures.paidPrimaryCourseSlug)
    expect(paidCourse?.id).toBeTruthy()

    await loginAsUser(page)
    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
    await waitForPlayerReady(page)

    await page.getByRole("button", { name: /eliminar/i }).click()

    await expect(page.getByText(/tu reseña fue eliminada/i)).toBeVisible()

    // Verify deleted in DB
    await expect
      .poll(async () =>
        getReviewForCourse(qaCredentials.userEmail, paidCourse!.id)
      )
      .toBeNull()

    // Form should revert to "Deja tu reseña"
    await expect(page.getByText(/deja tu reseña/i)).toBeVisible()
  })

  test("resena eliminada en dashboard desaparece de la pagina publica", async ({
    page,
  }) => {
    await page.goto(`/cursos/${qaFixtures.paidPrimaryCourseSlug}`)

    await expect(page.getByText(reviewTextEdited)).not.toBeVisible()
  })
})
