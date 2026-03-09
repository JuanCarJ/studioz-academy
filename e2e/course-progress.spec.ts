import { expect, test } from "@playwright/test"

import {
  syncCourseProgressForEnrolledUsers,
  syncCourseProgressSnapshot,
} from "../src/lib/course-progress"
import { loginAsUser } from "./support/auth"
import {
  deleteCourseProgressForEmail,
  e2eSupabase,
  ensureBusinessFixtures,
  getCourseProgress,
  getLessonByTitle,
  qaCredentials,
  qaFixtures,
  resetCourseProgressForEmail,
  upsertCourseProgressForEmail,
  upsertLessonCompletionForEmail,
  upsertLessonVideoPositionForEmail,
} from "./support/db"
import { installBunnyPlayerStub, waitForPlayerReady } from "./support/player"

const runId = Date.now().toString(36)

async function resetPaidCourseProgressState() {
  const fixtures = await ensureBusinessFixtures()

  await resetCourseProgressForEmail({
    email: qaCredentials.userEmail,
    courseId: fixtures.paidPrimaryCourseId,
    lastLessonId: fixtures.paidPreviewLessonId,
  })

  return fixtures
}

test.describe.serial("course progress integrity", () => {
  test.skip(({ isMobile }) => isMobile, "La suite muta progreso compartido y corre en desktop.")

  test.beforeEach(async ({ page }) => {
    await installBunnyPlayerStub(page)
  })

  test("dashboard usa lesson_progress como fallback cuando falta course_progress", async ({
    page,
  }) => {
    const fixtures = await resetPaidCourseProgressState()

    await deleteCourseProgressForEmail({
      email: qaCredentials.userEmail,
      courseId: fixtures.paidPrimaryCourseId,
    })
    await upsertLessonCompletionForEmail({
      email: qaCredentials.userEmail,
      lessonId: fixtures.paidPreviewLessonId,
      completed: true,
    })

    await loginAsUser(page)
    await page.goto("/dashboard")

    const card = page.getByTestId(`enrolled-course-card-${qaFixtures.paidPrimaryCourseSlug}`)
    await expect(card).toContainText("1 de 2 lecciones")
    await expect(card).toContainText("50%")
    await expect(
      page.getByTestId(`enrolled-course-link-${qaFixtures.paidPrimaryCourseSlug}`)
    ).toHaveText("Continuar")
  })

  test("dashboard ignora un course_progress stale y muestra el agregado efectivo", async ({
    page,
  }) => {
    const fixtures = await resetPaidCourseProgressState()

    await upsertLessonCompletionForEmail({
      email: qaCredentials.userEmail,
      lessonId: fixtures.paidPreviewLessonId,
      completed: true,
    })
    await upsertCourseProgressForEmail({
      email: qaCredentials.userEmail,
      courseId: fixtures.paidPrimaryCourseId,
      lastLessonId: fixtures.paidPreviewLessonId,
      completedLessons: 2,
      isCompleted: true,
    })

    await loginAsUser(page)
    await page.goto("/dashboard")

    const card = page.getByTestId(`enrolled-course-card-${qaFixtures.paidPrimaryCourseSlug}`)
    await expect(card).toContainText("1 de 2 lecciones")
    await expect(card).toContainText("50%")
    await expect(
      page.getByTestId(`enrolled-course-link-${qaFixtures.paidPrimaryCourseSlug}`)
    ).toHaveText("Continuar")
  })

  test("completar e incompletar una leccion refresca el dashboard con el porcentaje correcto", async ({
    page,
  }) => {
    const fixtures = await resetPaidCourseProgressState()

    await loginAsUser(page)
    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)

    await waitForPlayerReady(page)
    await page.getByRole("button", { name: /marcar como completada/i }).click()
    await expect(page.getByRole("button", { name: /completada/i })).toBeVisible()

    await expect
      .poll(async () => {
        const progress = await getCourseProgress(
          qaCredentials.userEmail,
          fixtures.paidPrimaryCourseId
        )
        return `${progress?.completed_lessons ?? 0}|${progress?.is_completed ?? false}`
      })
      .toBe("1|false")

    await page.goto("/dashboard")
    const card = page.getByTestId(`enrolled-course-card-${qaFixtures.paidPrimaryCourseSlug}`)
    await expect(card).toContainText("1 de 2 lecciones")
    await expect(card).toContainText("50%")

    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
    await waitForPlayerReady(page)
    await page.getByRole("button", { name: /completada/i }).click()
    await expect(page.getByRole("button", { name: /marcar como completada/i })).toBeVisible()

    await expect
      .poll(async () => {
        const progress = await getCourseProgress(
          qaCredentials.userEmail,
          fixtures.paidPrimaryCourseId
        )
        return `${progress?.completed_lessons ?? 0}|${progress?.is_completed ?? false}`
      })
      .toBe("0|false")

    await page.goto("/dashboard")
    await expect(card).toContainText("0 de 2 lecciones")
    await expect(card).toContainText("0%")
  })

  test("player ignora last_lesson_id de otro curso y retoma desde video_position valido", async ({
    page,
  }) => {
    const fixtures = await resetPaidCourseProgressState()
    const foreignLesson = await getLessonByTitle(
      fixtures.freeCourseId,
      "QA E2E Tatuaje Gratis Intro"
    )

    expect(foreignLesson?.id).toBeTruthy()

    await upsertCourseProgressForEmail({
      email: qaCredentials.userEmail,
      courseId: fixtures.paidPrimaryCourseId,
      lastLessonId: foreignLesson?.id ?? null,
      completedLessons: 0,
      isCompleted: false,
    })
    await upsertLessonVideoPositionForEmail({
      email: qaCredentials.userEmail,
      lessonId: fixtures.paidMainLessonId,
      position: 37,
    })

    await loginAsUser(page)
    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)

    const player = await waitForPlayerReady(page)

    await expect(player).toHaveAttribute("data-last-command", "setCurrentTime")
    await expect(player).toHaveAttribute("data-last-seek-time", "37")
  })

  test("el recalc de progreso reacciona a nuevas lecciones y limpia last_lesson_id borrado", async ({
    page,
  }) => {
    const fixtures = await resetPaidCourseProgressState()
    const adminSupabase = e2eSupabase
    const extraLessonTitle = `QA E2E Progress Extra ${runId}`
    const extraVideoId = `qa-e2e-progress-extra-${runId}`
    let extraLessonId: string | null = null

    try {
      await upsertLessonCompletionForEmail({
        email: qaCredentials.userEmail,
        lessonId: fixtures.paidPreviewLessonId,
        completed: true,
      })
      await upsertLessonCompletionForEmail({
        email: qaCredentials.userEmail,
        lessonId: fixtures.paidMainLessonId,
        completed: true,
      })
      await syncCourseProgressSnapshot({
        supabase: adminSupabase,
        userId: fixtures.userId,
        courseId: fixtures.paidPrimaryCourseId,
        lastLessonId: fixtures.paidMainLessonId,
        touchLastAccess: true,
      })

      await expect
        .poll(async () => {
          const progress = await getCourseProgress(
            qaCredentials.userEmail,
            fixtures.paidPrimaryCourseId
          )
          return `${progress?.completed_lessons ?? 0}|${progress?.is_completed ?? false}`
        })
        .toBe("2|true")

      const { data: lesson, error: lessonError } = await adminSupabase
        .from("lessons")
        .insert({
          course_id: fixtures.paidPrimaryCourseId,
          title: extraLessonTitle,
          description: "Leccion temporal para validar recalculo de progreso.",
          bunny_video_id: extraVideoId,
          bunny_library_id: process.env.BUNNY_LIBRARY_ID ?? "603019",
          duration_seconds: 60,
          sort_order: 3,
          is_free: false,
        })
        .select("id")
        .single()

      if (lessonError || !lesson?.id) {
        throw lessonError ?? new Error("Unable to create temporary lesson")
      }

      extraLessonId = lesson.id

      await syncCourseProgressForEnrolledUsers({
        supabase: adminSupabase,
        courseId: fixtures.paidPrimaryCourseId,
      })

      await loginAsUser(page)
      await page.goto("/dashboard")

      const card = page.getByTestId(`enrolled-course-card-${qaFixtures.paidPrimaryCourseSlug}`)
      await expect(card).toContainText("2 de 3 lecciones")
      await expect(card).toContainText("67%")
      await expect(
        page.getByTestId(`enrolled-course-link-${qaFixtures.paidPrimaryCourseSlug}`)
      ).toHaveText("Continuar")

      await upsertCourseProgressForEmail({
        email: qaCredentials.userEmail,
        courseId: fixtures.paidPrimaryCourseId,
        lastLessonId: extraLessonId,
        completedLessons: 2,
        isCompleted: false,
      })

      await adminSupabase.from("lesson_progress").delete().eq("lesson_id", extraLessonId)
      await adminSupabase.from("lessons").delete().eq("id", extraLessonId)
      extraLessonId = null

      await syncCourseProgressForEnrolledUsers({
        supabase: adminSupabase,
        courseId: fixtures.paidPrimaryCourseId,
      })

      await expect
        .poll(async () => {
          const progress = await getCourseProgress(
            qaCredentials.userEmail,
            fixtures.paidPrimaryCourseId
          )
          return `${progress?.completed_lessons ?? 0}|${progress?.is_completed ?? false}|${progress?.last_lesson_id ?? "null"}`
        })
        .toBe("2|true|null")
    } finally {
      if (extraLessonId) {
        await adminSupabase.from("lesson_progress").delete().eq("lesson_id", extraLessonId)
        await adminSupabase.from("lessons").delete().eq("id", extraLessonId)
        await syncCourseProgressForEnrolledUsers({
          supabase: adminSupabase,
          courseId: fixtures.paidPrimaryCourseId,
        })
      }
    }
  })
})
