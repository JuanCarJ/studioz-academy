import { expect, test } from "@playwright/test"

import { loginAsUser } from "./support/auth"
import {
  clearUserCart,
  e2eSupabase,
  ensureBusinessFixtures,
  getCartItemsForEmail,
  getCourseBySlug,
  getEnrollment,
  getProfileByEmail,
  qaCredentials,
  qaFixtures,
} from "./support/db"

test.describe.serial("Catalog quick actions", () => {
  test.skip(
    ({ isMobile }) => isMobile,
    "Suite muta DB compartida; se ejecuta una sola vez en desktop."
  )

  test.beforeAll(async () => {
    await ensureBusinessFixtures()
  })

  test("boton agregar redirige a login si no autenticado", async ({ page }) => {
    await page.goto("/cursos")

    const card = page.locator("article").filter({
      hasText: qaFixtures.cartCourseOneTitle,
    })
    await expect(card).toBeVisible()

    const addButton = card.getByRole("button", { name: /agregar/i })
    await expect(addButton).toBeVisible()
    await addButton.click()

    await expect(page).toHaveURL(/\/login/)
    const url = new URL(page.url())
    expect(url.searchParams.get("redirect")).toContain("/cursos/")
    expect(url.searchParams.get("addToCart")).toBeTruthy()
  })

  test("agrega curso pago al carrito desde catalogo", async ({ page }) => {
    await clearUserCart(qaCredentials.userEmail)
    await loginAsUser(page)
    await page.goto("/cursos")

    const card = page.locator("article").filter({
      hasText: qaFixtures.cartCourseOneTitle,
    })
    await expect(card).toBeVisible()

    const addButton = card.getByRole("button", { name: /agregar/i })
    await expect(addButton).toBeVisible()
    await addButton.click()

    // Optimistic: button changes to "En carrito"
    await expect(card.getByRole("button", { name: /en carrito/i })).toBeVisible()

    // Poll DB for confirmation
    await expect
      .poll(
        async () => {
          const items = await getCartItemsForEmail(qaCredentials.userEmail)
          return items.length
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThanOrEqual(1)
  })

  test("curso ya en carrito muestra estado correcto", async ({ page }) => {
    // Depends on previous test — cart already has the course
    await page.goto("/cursos")

    const card = page.locator("article").filter({
      hasText: qaFixtures.cartCourseOneTitle,
    })
    await expect(card).toBeVisible()

    const inCartButton = card.getByRole("button", { name: /en carrito/i })
    await expect(inCartButton).toBeVisible()
    await expect(inCartButton).toBeDisabled()
  })

  test("curso inscrito muestra 'Ir al curso'", async ({ page }) => {
    // QA user is enrolled in paidPrimaryCourse via ensureBusinessFixtures
    await page.goto("/cursos")

    const card = page.locator("article").filter({
      hasText: qaFixtures.paidPrimaryCourseTitle,
    })
    await expect(card).toBeVisible()

    const goButton = card.getByRole("link", { name: /ir al curso/i })
    await expect(goButton).toBeVisible()
    await goButton.click()

    await expect(page).toHaveURL(
      `/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`
    )
  })

  test("curso gratis inscribe directamente desde catalogo", async ({
    page,
  }) => {
    // Cleanup enrollment for the free course if it exists
    const freeCourse = await getCourseBySlug(qaFixtures.freeCourseSlug)
    if (freeCourse) {
      const profile = await getProfileByEmail(qaCredentials.userEmail)
      if (profile) {
        await e2eSupabase
          .from("enrollments")
          .delete()
          .eq("user_id", profile.authUser.id)
          .eq("course_id", freeCourse.id)

        await e2eSupabase
          .from("course_progress")
          .delete()
          .eq("user_id", profile.authUser.id)
          .eq("course_id", freeCourse.id)
      }
    }

    await page.goto("/cursos")

    const card = page.locator("article").filter({
      hasText: qaFixtures.freeCourseTitle,
    })
    await expect(card).toBeVisible()

    const freeButton = card.getByRole("button", { name: /gratis/i })
    await expect(freeButton).toBeVisible()
    await freeButton.click()

    await expect(page).toHaveURL(
      `/dashboard/cursos/${qaFixtures.freeCourseSlug}`,
      { timeout: 15_000 }
    )

    // Poll DB for enrollment confirmation
    await expect
      .poll(
        async () => {
          const enrollment = await getEnrollment(
            qaCredentials.userEmail,
            freeCourse!.id
          )
          return enrollment
        },
        { timeout: 10_000 }
      )
      .not.toBeNull()
  })

  test("click en tarjeta (no en boton) navega al detalle", async ({
    page,
  }) => {
    await page.goto("/cursos")

    const card = page.locator("article").filter({
      hasText: qaFixtures.cartCourseTwoTitle,
    })
    await expect(card).toBeVisible()

    // Click the title text (which overlays the stretched link)
    const titleElement = card.locator("h3")
    await titleElement.click()

    await expect(page).toHaveURL(
      `/cursos/${qaFixtures.cartCourseTwoSlug}`
    )
  })
})
