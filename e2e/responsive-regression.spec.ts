import { expect, test, type Page } from "@playwright/test"

import { loginAsAdmin, loginAsUser } from "./support/auth"
import {
  ensureBusinessFixtures,
  ensureReviewForCourse,
  qaCredentials,
  qaFixtures,
} from "./support/db"
import { installBunnyPlayerStub, waitForPlayerReady } from "./support/player"

const mobileViewports = [
  { label: "320x568", width: 320, height: 568 },
  { label: "390x844", width: 390, height: 844 },
]

const desktopViewports = [
  { label: "768x1024", width: 768, height: 1024 },
  { label: "1440x900", width: 1440, height: 900 },
]

const publicRoutes = [
  "/",
  "/servicios",
  "/cursos",
  `/instructores/${qaFixtures.danceInstructorSlug}`,
  "/login",
]

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body

    return {
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      bodyScrollWidth: body?.scrollWidth ?? 0,
    }
  })

  expect(
    Math.max(metrics.scrollWidth, metrics.bodyScrollWidth),
    `${label} should not overflow horizontally`
  ).toBeLessThanOrEqual(metrics.clientWidth + 1)
}

test.describe("responsive regressions", () => {
  test.beforeEach(async ({ page }) => {
    await installBunnyPlayerStub(page)
    await ensureBusinessFixtures()
  })

  for (const viewport of mobileViewports) {
    test(`core routes stay within viewport at ${viewport.label}`, async ({
      page,
    }, testInfo) => {
      test.skip(!testInfo.project.name.includes("mobile"), "Mobile project only")

      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })

      for (const route of publicRoutes) {
        await page.goto(route)
        await expectNoHorizontalOverflow(page, `${route} @ ${viewport.label}`)
      }

      await loginAsUser(page)
      await page.goto("/dashboard")
      await expectNoHorizontalOverflow(page, `/dashboard @ ${viewport.label}`)
    })
  }

  for (const viewport of desktopViewports) {
    test(`desktop and tablet routes stay within viewport at ${viewport.label}`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name.includes("mobile"), "Desktop project only")

      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })

      for (const route of publicRoutes) {
        await page.goto(route)
        await expectNoHorizontalOverflow(page, `${route} @ ${viewport.label}`)
      }

      await loginAsUser(page)

      await page.goto("/dashboard")
      await expectNoHorizontalOverflow(page, `/dashboard @ ${viewport.label}`)

      await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
      await waitForPlayerReady(page)
      await expectNoHorizontalOverflow(
        page,
        `/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug} @ ${viewport.label}`
      )
    })
  }

  test("public preview dialog remains usable on mobile", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "Mobile project only")

    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto(`/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
    await expectNoHorizontalOverflow(page, "public course detail @ 320x568")

    await page
      .getByRole("button", { name: /qa e2e preview salsa/i })
      .click()

    const dialog = page.getByRole("dialog", {
      name: /qa e2e preview salsa/i,
    })

    await expect(dialog).toBeVisible()
    await waitForPlayerReady(page, {
      progressFlushReady: false,
      scopeSelector: '[role="dialog"]',
    })

    const box = await dialog.boundingBox()
    expect(box?.x ?? 999).toBeLessThanOrEqual(1)
    expect(box?.y ?? 999).toBeLessThanOrEqual(1)
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(318)

    await expectNoHorizontalOverflow(page, "public preview dialog @ 320x568")
  })

  test("mobile player closes lesson sheet and keeps account access in the header", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "Mobile project only")

    await page.setViewportSize({ width: 320, height: 568 })
    await loginAsUser(page)
    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
    await waitForPlayerReady(page)

    await expect(page.getByTestId("mobile-bottom-menu-trigger")).toHaveCount(0)
    await expect(page.getByTestId("mobile-header-user-menu-trigger")).toBeVisible()

    await page.getByRole("button", { name: /ver lecciones/i }).click()

    const lessonSheet = page.locator('[data-slot="sheet-content"]')
    await expect(lessonSheet).toBeVisible()

    await lessonSheet
      .getByRole("button", { name: /qa e2e salsa principal/i })
      .click()

    await expect(lessonSheet).not.toBeVisible()
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: /qa e2e salsa principal/i,
      })
    ).toBeVisible()
    await waitForPlayerReady(page)
    await expectNoHorizontalOverflow(page, "mobile course player @ 320x568")

    await page.getByTestId("mobile-header-user-menu-trigger").click()
    await expect(page.getByTestId("logout-button")).toBeVisible()
  })

  test("admin mobile listings render usable cards without lateral scroll", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "Mobile project only")

    const fixtures = await ensureBusinessFixtures()

    await ensureReviewForCourse({
      email: qaCredentials.userEmail,
      courseId: fixtures.paidPrimaryCourseId,
      rating: 5,
      text: "Reseña QA para validar cards móviles en admin.",
      isVisible: true,
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await loginAsAdmin(page)

    await page.goto("/admin/ventas")
    await expect(
      page.getByRole("button", { name: /ver detalle/i }).first()
    ).toBeVisible()
    await expectNoHorizontalOverflow(page, "/admin/ventas @ 390x844")

    await page.goto("/admin/usuarios")
    await expect(
      page.getByRole("link", { name: /ver ficha/i }).first()
    ).toBeVisible()
    await expectNoHorizontalOverflow(page, "/admin/usuarios @ 390x844")

    await page.goto("/admin/resenas")
    await expect(
      page.getByRole("button", { name: /eliminar/i }).first()
    ).toBeVisible()
    await expectNoHorizontalOverflow(page, "/admin/resenas @ 390x844")
  })
})
