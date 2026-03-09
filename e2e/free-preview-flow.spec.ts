import { expect, test } from "@playwright/test"

import { loginAsUser } from "./support/auth"
import {
  clearUserCart,
  e2eSupabase,
  ensureBusinessFixtures,
  getCartItemsForEmail,
  qaCredentials,
  qaFixtures,
} from "./support/db"
import {
  emitBunnyPlayerEvent,
  installBunnyPlayerStub,
  waitForPlayerReady,
} from "./support/player"

const runId = Date.now().toString(36)

test.describe.serial("public free preview flow", () => {
  test.beforeEach(async ({ page }) => {
    await installBunnyPlayerStub(page)
  })

  test("encadena varias lecciones gratuitas y desbloquea el curso pago en carrito", async ({
    page,
  }) => {
    const fixtures = await ensureBusinessFixtures()
    const firstFreeLessonTitle = `QA E2E Cart Preview Uno ${runId}`
    const secondFreeLessonTitle = `QA E2E Cart Preview Dos ${runId}`
    const temporaryLessonIds: string[] = []

    await clearUserCart(qaCredentials.userEmail)

    try {
      const { data: firstLesson, error: firstError } = await e2eSupabase
        .from("lessons")
        .insert({
          course_id: fixtures.cartCourseOneId,
          title: firstFreeLessonTitle,
          description: "Primera leccion gratuita temporal para validar la secuencia publica.",
          bunny_video_id: `qa-e2e-cart-preview-1-${runId}`,
          bunny_library_id: process.env.BUNNY_LIBRARY_ID ?? "603019",
          duration_seconds: 75,
          sort_order: 2,
          is_free: true,
        })
        .select("id")
        .single()

      if (firstError || !firstLesson?.id) {
        throw firstError ?? new Error("Unable to create first temporary free lesson")
      }

      temporaryLessonIds.push(firstLesson.id)

      const { data: secondLesson, error: secondError } = await e2eSupabase
        .from("lessons")
        .insert({
          course_id: fixtures.cartCourseOneId,
          title: secondFreeLessonTitle,
          description: "Segunda leccion gratuita temporal para validar la secuencia publica.",
          bunny_video_id: `qa-e2e-cart-preview-2-${runId}`,
          bunny_library_id: process.env.BUNNY_LIBRARY_ID ?? "603019",
          duration_seconds: 80,
          sort_order: 3,
          is_free: true,
        })
        .select("id")
        .single()

      if (secondError || !secondLesson?.id) {
        throw secondError ?? new Error("Unable to create second temporary free lesson")
      }

      temporaryLessonIds.push(secondLesson.id)

      await loginAsUser(page)
      await page.goto(`/cursos/${qaFixtures.cartCourseOneSlug}`)

      await page.getByRole("button", { name: new RegExp(firstFreeLessonTitle, "i") }).click()
      await waitForPlayerReady(page, {
        progressFlushReady: false,
        scopeSelector: '[role="dialog"]',
      })

      await emitBunnyPlayerEvent(
        page,
        { event: "ended" },
        { scopeSelector: '[role="dialog"]' }
      )

      await expect(
        page.getByRole("button", { name: /continuar siguiente leccion gratuita/i })
      ).toBeVisible()

      await page.getByRole("button", { name: /continuar siguiente leccion gratuita/i }).click()
      await expect(
        page.getByRole("dialog", { name: new RegExp(secondFreeLessonTitle, "i") })
      ).toBeVisible()

      await waitForPlayerReady(page, {
        progressFlushReady: false,
        scopeSelector: '[role="dialog"]',
      })
      await emitBunnyPlayerEvent(
        page,
        { event: "ended" },
        { scopeSelector: '[role="dialog"]' }
      )

      await expect(
        page.getByRole("button", { name: /desbloquear curso completo/i })
      ).toBeVisible()
      await page.getByRole("button", { name: /desbloquear curso completo/i }).click()

      await expect
        .poll(async () => (await getCartItemsForEmail(qaCredentials.userEmail)).length)
        .toBe(1)

      await expect(
        page.getByRole("link", { name: /ya en tu carrito/i }).first()
      ).toBeVisible()
    } finally {
      await clearUserCart(qaCredentials.userEmail)
      if (temporaryLessonIds.length > 0) {
        await e2eSupabase.from("lesson_progress").delete().in("lesson_id", temporaryLessonIds)
        await e2eSupabase.from("lessons").delete().in("id", temporaryLessonIds)
      }
    }
  })

  test("curso pago con una sola gratuita redirige a login para desbloquear", async ({
    page,
  }) => {
    await ensureBusinessFixtures()
    await clearUserCart(qaCredentials.userEmail)

    await page.goto(`/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
    await page.getByRole("button", { name: /qa e2e preview salsa/i }).click()

    await waitForPlayerReady(page, {
      progressFlushReady: false,
      scopeSelector: '[role="dialog"]',
    })
    await emitBunnyPlayerEvent(
      page,
      { event: "ended" },
      { scopeSelector: '[role="dialog"]' }
    )

    await expect(
      page.getByRole("button", { name: /desbloquear curso completo/i })
    ).toBeVisible()
    await page.getByRole("button", { name: /desbloquear curso completo/i }).click()

    await expect(page).toHaveURL(
      new RegExp(
        `/login\\?redirect=%2Fcursos%2F${qaFixtures.paidPrimaryCourseSlug}.*addToCart`
      )
    )
  })

  test("curso gratuito no muestra CTA de compra al terminar su unica leccion", async ({
    page,
  }) => {
    await ensureBusinessFixtures()

    await page.goto(`/cursos/${qaFixtures.freeCourseSlug}`)
    await page.getByRole("button", { name: /qa e2e tatuaje gratis intro/i }).click()

    await waitForPlayerReady(page, {
      progressFlushReady: false,
      scopeSelector: '[role="dialog"]',
    })
    await emitBunnyPlayerEvent(
      page,
      { event: "ended" },
      { scopeSelector: '[role="dialog"]' }
    )

    await expect(page.getByText(/ya terminaste las lecciones disponibles/i)).toBeVisible()
    await expect(
      page.getByRole("button", { name: /desbloquear curso completo/i })
    ).toHaveCount(0)
  })
})
