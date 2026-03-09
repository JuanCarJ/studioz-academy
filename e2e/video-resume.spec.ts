import { expect, test } from "@playwright/test"

import {
  loginAsUser,
  logoutCurrentUser,
} from "./support/auth"
import {
  ensureBusinessFixtures,
  getCourseProgress,
  getLessonProgress,
  qaCredentials,
  qaFixtures,
  resetCourseProgressForEmail,
} from "./support/db"
import {
  emitBunnyPlayerEvent,
  waitForSyntheticPlayerReady,
} from "./support/player"

async function resetVideoResumeState() {
  const fixtures = await ensureBusinessFixtures()

  await resetCourseProgressForEmail({
    email: qaCredentials.userEmail,
    courseId: fixtures.paidPrimaryCourseId,
    lastLessonId: fixtures.paidPreviewLessonId,
  })

  return fixtures
}

test.describe("video resume flow", () => {
  test("muestra Continuar en dashboard cuando existe una leccion guardada aunque el progreso sea 0%", async ({
    page,
  }) => {
    const fixtures = await resetVideoResumeState()

    await loginAsUser(page)
    await page.goto("/dashboard")

    await expect(
      page.getByTestId(`enrolled-course-link-${qaFixtures.paidPrimaryCourseSlug}`)
    ).toHaveText("Continuar")

    const progress = await getCourseProgress(
      qaCredentials.userEmail,
      fixtures.paidPrimaryCourseId
    )

    expect(progress?.completed_lessons ?? 0).toBe(0)
    expect(progress?.last_lesson_id).toBe(fixtures.paidPreviewLessonId)
  })

  test("persiste progreso al pausar, cerrar sesion y reanuda al volver a entrar", async ({
    page,
  }) => {
    const fixtures = await resetVideoResumeState()
    const previousProgress = await getCourseProgress(
      qaCredentials.userEmail,
      fixtures.paidPrimaryCourseId
    )

    await loginAsUser(page)
    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)

    await waitForSyntheticPlayerReady(page)

    await emitBunnyPlayerEvent(page, {
      event: "timeupdate",
      data: { seconds: 42 },
    })
    await emitBunnyPlayerEvent(page, { event: "pause" })

    await expect
      .poll(async () => {
        const lessonProgress = await getLessonProgress(
          qaCredentials.userEmail,
          fixtures.paidPreviewLessonId
        )

        return lessonProgress?.video_position ?? null
      })
      .toBe(42)

    await expect
      .poll(async () => {
        const progress = await getCourseProgress(
          qaCredentials.userEmail,
          fixtures.paidPrimaryCourseId
        )

        return progress?.last_accessed_at ?? null
      })
      .not.toBe(previousProgress?.last_accessed_at ?? null)

    await logoutCurrentUser(page)

    await loginAsUser(page)
    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)

    const resumedPlayer = await waitForSyntheticPlayerReady(page)

    await emitBunnyPlayerEvent(page, { event: "ready" })

    await expect(resumedPlayer).toHaveAttribute("data-last-command", "seek")
    await expect(resumedPlayer).toHaveAttribute("data-last-seek-time", "42")
  })

  test("persiste progreso pendiente cuando la pagina se abandona", async ({ page }) => {
    const fixtures = await resetVideoResumeState()
    const previousProgress = await getCourseProgress(
      qaCredentials.userEmail,
      fixtures.paidPrimaryCourseId
    )

    await loginAsUser(page)
    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
    await waitForSyntheticPlayerReady(page)

    await emitBunnyPlayerEvent(page, {
      event: "timeupdate",
      data: { seconds: 73 },
    })

    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/dashboard$/)

    await expect
      .poll(async () => {
        const lessonProgress = await getLessonProgress(
          qaCredentials.userEmail,
          fixtures.paidPreviewLessonId
        )

        return lessonProgress?.video_position ?? null
      })
      .toBe(73)

    await expect
      .poll(async () => {
        const progress = await getCourseProgress(
          qaCredentials.userEmail,
          fixtures.paidPrimaryCourseId
        )

        return progress?.last_accessed_at ?? null
      })
      .not.toBe(previousProgress?.last_accessed_at ?? null)
  })

  test("expone logout movil y conserva la reanudacion del video", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "Mobile only")

    const fixtures = await resetVideoResumeState()

    await loginAsUser(page)
    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
    await waitForSyntheticPlayerReady(page)

    await emitBunnyPlayerEvent(page, {
      event: "timeupdate",
      data: { seconds: 58 },
    })
    await emitBunnyPlayerEvent(page, { event: "pause" })

    await expect
      .poll(async () => {
        const lessonProgress = await getLessonProgress(
          qaCredentials.userEmail,
          fixtures.paidPreviewLessonId
        )

        return lessonProgress?.video_position ?? null
      })
      .toBe(58)

    await page.getByTestId("mobile-bottom-menu-trigger").click()
    await expect(page.getByTestId("mobile-logout-button")).toBeVisible()
    await page.getByTestId("mobile-logout-button").click()
    await expect(page).toHaveURL(/\/$/)

    await loginAsUser(page)
    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)

    const resumedPlayer = await waitForSyntheticPlayerReady(page)

    await emitBunnyPlayerEvent(page, { event: "ready" })

    await expect(resumedPlayer).toHaveAttribute("data-last-command", "seek")
    await expect(resumedPlayer).toHaveAttribute("data-last-seek-time", "58")
  })
})
