import { expect, test, type Page } from "@playwright/test"

import { loginAsAdmin, loginAsUser } from "./support/auth"
import {
  e2eSupabase,
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

      await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`, {
        waitUntil: "domcontentloaded",
      })
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: new RegExp(qaFixtures.paidPrimaryCourseTitle, "i"),
        })
      ).toBeVisible()
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
    await expect(dialog.getByText(/qa e2e preview salsa/i)).toBeVisible()

    const box = await dialog.boundingBox()
    expect(box?.x ?? 999).toBeLessThanOrEqual(8)
    expect(box?.y ?? 999).toBeLessThanOrEqual(16)
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(300)

    await expectNoHorizontalOverflow(page, "public preview dialog @ 320x568")
  })

  test("mobile visitor keeps auth discoverable without crowding the bottom bar", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "Mobile project only")

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")

    await expect(page.getByTestId("mobile-bottom-tab-login")).toBeVisible()
    await expect(
      page.getByTestId("mobile-bottom-tab-login").getByText(/iniciar sesion/i)
    ).toBeVisible()

    await page.getByTestId("mobile-bottom-menu-trigger").click()

    const drawer = page.locator('[data-slot="sheet-content"]')
    await expect(drawer.getByRole("link", { name: /iniciar sesion/i })).toBeVisible()
    await expect(drawer.getByRole("link", { name: /registrarse/i })).toBeVisible()
    await expectNoHorizontalOverflow(page, "mobile auth nav @ 390x844")
  })

  test("mobile player closes lesson sheet and keeps account access in the header", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "Mobile project only")

    await page.setViewportSize({ width: 320, height: 568 })
    await loginAsUser(page)
    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`, {
      waitUntil: "domcontentloaded",
    })
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: new RegExp(qaFixtures.paidPrimaryCourseTitle, "i"),
      })
    ).toBeVisible()

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

    if ((await page.getByTestId("course-video-player").count()) > 0) {
      await waitForPlayerReady(page)
    }

    await expectNoHorizontalOverflow(page, "mobile course player @ 320x568")

    await page.getByTestId("mobile-header-user-menu-trigger").click()
    await expect(page.getByTestId("logout-button")).toBeVisible()
  })

  test("mobile player falls back cleanly when lesson media is invalid", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "Mobile project only")
    test.setTimeout(120_000)

    const fixtures = await ensureBusinessFixtures()

    await e2eSupabase
      .from("lessons")
      .update({
        bunny_video_id: "qa-invalid-mobile-media",
        bunny_status: "ready",
        video_upload_error: null,
      })
      .eq("id", fixtures.paidMainLessonId)

    try {
      await page.setViewportSize({ width: 390, height: 844 })
      await loginAsUser(page)
      await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`, {
        waitUntil: "domcontentloaded",
      })
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: new RegExp(qaFixtures.paidPrimaryCourseTitle, "i"),
        })
      ).toBeVisible()

      await page.getByRole("button", { name: /ver lecciones/i }).click()

      const lessonSheet = page.locator('[data-slot="sheet-content"]')
      await lessonSheet
        .getByRole("button", { name: /qa e2e salsa principal/i })
        .click()

      await expect(
        page.getByText(/asset valido en bunny en este momento/i)
      ).toBeVisible()
      await expect(
        page.getByRole("link", { name: /necesito ayuda por whatsapp/i })
      ).toBeVisible()
      await expect(page.getByTestId("course-video-player")).toHaveCount(0)
      await expectNoHorizontalOverflow(page, "mobile player fallback @ 390x844")
    } finally {
      await ensureBusinessFixtures()
    }
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
