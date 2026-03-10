import { expect, test } from "@playwright/test"

import { loginAsUser } from "./support/auth"
import {
  clearUserCart,
  e2eSupabase,
  ensureBusinessFixtures,
  getCartItemsForEmail,
  getCourseBySlug,
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
    const fixtures = await ensureBusinessFixtures()
    const temporaryLessonTitle = `QA E2E Login Preview ${runId}`
    let temporaryLessonId: string | null = null

    await clearUserCart(qaCredentials.userEmail)

    try {
      const { data: lesson, error: lessonError } = await e2eSupabase
        .from("lessons")
        .insert({
          course_id: fixtures.paidPrimaryCourseId,
          title: temporaryLessonTitle,
          description: "Leccion temporal para validar redireccion a login desde preview.",
          bunny_video_id: `qa-e2e-login-preview-${runId}`,
          bunny_library_id: process.env.BUNNY_LIBRARY_ID ?? "603019",
          duration_seconds: 70,
          sort_order: 99,
          is_free: true,
        })
        .select("id")
        .single()

      if (lessonError || !lesson?.id) {
        throw lessonError ?? new Error("Unable to create temporary login preview lesson")
      }

      temporaryLessonId = lesson.id

      await page.goto(`/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
      await page.getByRole("button", { name: new RegExp(temporaryLessonTitle, "i") }).click()

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
    } finally {
      if (temporaryLessonId) {
        await e2eSupabase.from("lesson_progress").delete().eq("lesson_id", temporaryLessonId)
        await e2eSupabase.from("lessons").delete().eq("id", temporaryLessonId)
      }
    }
  })

  test("curso gratuito no muestra CTA de compra al terminar su unica leccion", async ({
    page,
  }) => {
    await ensureBusinessFixtures()
    const seedCourse = await getCourseBySlug(qaFixtures.freeCourseSlug)
    const tempCourseSlug = `qa-e2e-curso-gratis-preview-${runId}`
    const tempCourseTitle = `QA E2E Curso Gratis Preview ${runId}`
    const tempLessonTitle = `QA E2E Free Preview Solo ${runId}`
    let tempCourseId: string | null = null
    let tempLessonId: string | null = null

    try {
      const { data: course, error: courseError } = await e2eSupabase
        .from("courses")
        .insert({
          title: tempCourseTitle,
          slug: tempCourseSlug,
          description: "Curso temporal gratuito para validar final de preview sin CTA de compra.",
          short_description: "Curso gratis temporal.",
          category: "tatuaje",
          price: 0,
          is_free: true,
          thumbnail_url: null,
          preview_video_url: null,
          instructor_id: seedCourse?.instructor_id ?? "",
          legacy_instructor_name: null,
          is_published: true,
          published_at: new Date().toISOString(),
        })
        .select("id")
        .single()

      if (courseError || !course?.id) {
        throw courseError ?? new Error("Unable to create temporary free course")
      }

      tempCourseId = course.id

      const { data: lesson, error: lessonError } = await e2eSupabase
        .from("lessons")
        .insert({
          course_id: tempCourseId,
          title: tempLessonTitle,
          description: "Leccion temporal gratuita unica.",
          bunny_video_id: `qa-e2e-free-preview-solo-${runId}`,
          bunny_library_id: process.env.BUNNY_LIBRARY_ID ?? "603019",
          duration_seconds: 65,
          sort_order: 1,
          is_free: true,
        })
        .select("id")
        .single()

      if (lessonError || !lesson?.id) {
        throw lessonError ?? new Error("Unable to create temporary free preview lesson")
      }

      tempLessonId = lesson.id

      await page.goto(`/cursos/${tempCourseSlug}`)
      await page.getByRole("button", { name: new RegExp(tempLessonTitle, "i") }).click()

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
    } finally {
      if (tempLessonId) {
        await e2eSupabase.from("lesson_progress").delete().eq("lesson_id", tempLessonId)
        await e2eSupabase.from("lessons").delete().eq("id", tempLessonId)
      }
      if (tempCourseId) {
        await e2eSupabase.from("cart_items").delete().eq("course_id", tempCourseId)
        await e2eSupabase.from("enrollments").delete().eq("course_id", tempCourseId)
        await e2eSupabase.from("course_progress").delete().eq("course_id", tempCourseId)
        await e2eSupabase.from("courses").delete().eq("id", tempCourseId)
      }
    }
  })
})
