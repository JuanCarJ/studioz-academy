import { expect, test, type Page } from "@playwright/test"

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

function getCatalogCard(page: Page, title: string) {
  return page.locator("article").filter({ hasText: title })
}

async function loginFromCurrentPage(page: Page) {
  await page.goto(page.url())
  await page.getByLabel(/^email$/i).fill(qaCredentials.userEmail)
  await page.getByLabel(/contrasena/i).fill(qaCredentials.userPassword)
  const submitButton = page.getByRole("button", { name: /iniciar sesion$/i })
  await expect(submitButton).toBeEnabled()
  await submitButton.click()
}

async function clearFreeCourseEnrollment() {
  const freeCourse = await getCourseBySlug(qaFixtures.freeCourseSlug)
  const profile = await getProfileByEmail(qaCredentials.userEmail)

  if (!freeCourse || !profile) return freeCourse

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

  await e2eSupabase
    .from("cart_items")
    .delete()
    .eq("user_id", profile.authUser.id)
    .eq("course_id", freeCourse.id)

  return freeCourse
}

test.describe.serial("Catalog quick actions", () => {
  test.skip(
    ({ isMobile }) => isMobile,
    "Suite muta DB compartida; se ejecuta una sola vez en desktop."
  )

  test.beforeAll(async () => {
    await ensureBusinessFixtures()
  })

  test("guest + curso pago redirige a login con intent y completa hacia carrito", async ({
    page,
  }) => {
    const paidCourse = await getCourseBySlug(qaFixtures.cartCourseOneSlug)

    expect(paidCourse?.id).toBeTruthy()
    await clearUserCart(qaCredentials.userEmail)
    await page.goto("/cursos")

    const card = getCatalogCard(page, qaFixtures.cartCourseOneTitle)
    await expect(card).toBeVisible()

    await card.getByRole("button", { name: /agregar/i }).click()

    await expect(page).toHaveURL(/\/login/)
    const url = new URL(page.url())
    expect(url.searchParams.get("redirect")).toBe(`/cursos/${qaFixtures.cartCourseOneSlug}`)
    expect(url.searchParams.get("intent")).toBe("add_to_cart")
    expect(url.searchParams.get("courseId")).toBe(paidCourse!.id)
    expect(url.searchParams.get("addToCart")).toBe(paidCourse!.id)

    await loginFromCurrentPage(page)

    await expect(page).toHaveURL(/\/carrito$/)
    await expect
      .poll(async () => (await getCartItemsForEmail(qaCredentials.userEmail)).length)
      .toBe(1)
  })

  test("guest + curso gratis redirige a login con intent y completa inscripcion", async ({
    page,
  }) => {
    const freeCourse = await clearFreeCourseEnrollment()

    expect(freeCourse?.id).toBeTruthy()
    await page.goto("/cursos")

    const card = getCatalogCard(page, qaFixtures.freeCourseTitle)
    await expect(card).toBeVisible()

    await card.getByRole("button", { name: /gratis/i }).click()

    await expect(page).toHaveURL(/\/login/)
    const url = new URL(page.url())
    expect(url.searchParams.get("redirect")).toBe(`/cursos/${qaFixtures.freeCourseSlug}`)
    expect(url.searchParams.get("intent")).toBe("enroll_free")
    expect(url.searchParams.get("courseId")).toBe(freeCourse!.id)
    expect(url.searchParams.get("addToCart")).toBeNull()

    await loginFromCurrentPage(page)

    await expect(page).toHaveURL(`/dashboard/cursos/${qaFixtures.freeCourseSlug}`)
    await expect
      .poll(async () => getEnrollment(qaCredentials.userEmail, freeCourse!.id))
      .not.toBeNull()
  })

  test("autenticado + curso pago agrega y refleja estado en carrito", async ({
    page,
  }) => {
    await clearUserCart(qaCredentials.userEmail)
    await loginAsUser(page)
    await page.goto("/cursos")

    const card = getCatalogCard(page, qaFixtures.cartCourseOneTitle)
    await expect(card).toBeVisible()

    await card.getByRole("button", { name: /agregar/i }).click()

    await expect(card.getByRole("button", { name: /en carrito/i })).toBeVisible()
    await expect(card.getByRole("button", { name: /en carrito/i })).toBeDisabled()
    await expect
      .poll(async () => (await getCartItemsForEmail(qaCredentials.userEmail)).length)
      .toBe(1)
  })

  test("autenticado + curso inscrito muestra acceso al dashboard del curso", async ({
    page,
  }) => {
    await loginAsUser(page)
    await page.goto("/cursos")

    const card = getCatalogCard(page, qaFixtures.paidPrimaryCourseTitle)
    await expect(card).toBeVisible()

    const goButton = card.getByRole("link", { name: /ir al curso/i })
    await expect(goButton).toBeVisible()
    await goButton.click()

    await expect(page).toHaveURL(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
  })

  test("click en tarjeta fuera del CTA navega al detalle", async ({ page }) => {
    await page.goto("/cursos")

    const card = getCatalogCard(page, qaFixtures.cartCourseTwoTitle)
    const detailLink = card
      .locator(`a[href="/cursos/${qaFixtures.cartCourseTwoSlug}"]`)
      .first()
    await expect(card).toBeVisible()

    await detailLink.click()

    await expect(page).toHaveURL(`/cursos/${qaFixtures.cartCourseTwoSlug}`)
  })

  test("catalogo sanea cart_items stale y muestra CTA correcto para curso gratis", async ({
    page,
  }) => {
    const freeCourse = await clearFreeCourseEnrollment()
    const profile = await getProfileByEmail(qaCredentials.userEmail)

    expect(freeCourse?.id).toBeTruthy()
    expect(profile?.authUser.id).toBeTruthy()

    await e2eSupabase.from("cart_items").insert({
      user_id: profile!.authUser.id,
      course_id: freeCourse!.id,
    })

    await loginAsUser(page)
    await page.goto("/cursos")

    const card = getCatalogCard(page, qaFixtures.freeCourseTitle)
    await expect(card).toBeVisible()
    await expect(card.getByRole("button", { name: /en carrito/i })).toHaveCount(0)
    await expect(card.getByRole("button", { name: /gratis/i })).toBeVisible()
    await expect
      .poll(async () =>
        (await getCartItemsForEmail(qaCredentials.userEmail)).filter(
          (item) => item.course_id === freeCourse!.id
        ).length
      )
      .toBe(0)
  })

  test("teclado: el foco entra al link de la tarjeta y luego al CTA", async ({
    page,
  }) => {
    await clearUserCart(qaCredentials.userEmail)
    await page.goto("/cursos")

    const card = getCatalogCard(page, qaFixtures.cartCourseTwoTitle)
    const cardLink = card
      .locator(`a[href="/cursos/${qaFixtures.cartCourseTwoSlug}"]`)
      .first()
    const actionButton = card.getByRole("button", { name: /agregar/i })

    await expect(card).toBeVisible()

    await cardLink.focus()
    await expect(cardLink).toBeFocused()
    await expect
      .poll(async () =>
        card.evaluate((node) => getComputedStyle(node as HTMLElement).boxShadow)
      )
      .not.toBe("none")

    await page.keyboard.press("Tab")
    await expect(actionButton).toBeFocused()
  })
})
