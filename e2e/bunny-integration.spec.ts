import { expect, test, type Page } from "@playwright/test"

import { loginAsAdmin } from "./support/auth"
import {
  buildSignedEmbedUrl,
  createBunnyVideo,
  deleteBunnyVideo,
  ensureBunnyEnv,
  ensureFixtureExists,
  getBunnyVideo,
  getDefaultBunnyFixturePath,
  uploadVideoFile,
  waitForBunnyVideoReady,
} from "./support/bunny"
import {
  cleanupCoursesBySlugPrefix,
  e2eSupabase,
  ensureBusinessFixtures,
  getCourseById,
  getCourseBySlug,
  getInstructorBySlug,
  getLessonByTitle,
  qaFixtures,
  slugify,
} from "./support/db"

const bunnyEnabled = process.env.PLAYWRIGHT_BUNNY_ENABLED === "1"
const runId = Date.now().toString(36)
const courseTitle = `QA Bunny Curso ${runId}`
const courseSlug = slugify(courseTitle)
const lessonTitle = `QA Bunny Leccion ${runId}`
const previewVideoTitle = `QA Bunny Preview Helper ${runId}`
const fixturePath = getDefaultBunnyFixturePath()

let helperPreviewVideoId: string | null = null
let courseId: string | null = null
let activePreviewVideoId: string | null = null
let activeLessonVideoId: string | null = null

const createdVideoIds = new Set<string>()

function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value == null) {
    throw new Error(`Missing required value: ${label}`)
  }

  return value
}

async function waitForPreviewPromotion(
  page: Page,
  expectedVideoId: string
) {
  await waitForBunnyVideoReady(expectedVideoId)
  await page.goto(`/admin/cursos/${requireValue(courseId, "course id")}/editar`)
  await expect(page.getByTestId("course-preview-status")).toHaveText(/listo/i, {
    timeout: 2 * 60_000,
  })

  await expect
    .poll(
      async () => {
        const course = await getCourseById(requireValue(courseId, "course id"))
        return (
          course?.preview_bunny_video_id === expectedVideoId &&
          course?.preview_status === "ready" &&
          !course?.pending_preview_bunny_video_id
        )
      },
      { timeout: 2 * 60_000 }
    )
    .toBe(true)
}

async function waitForLessonPromotion(
  page: Page,
  expectedVideoId: string
) {
  await waitForBunnyVideoReady(expectedVideoId)
  await page.goto(`/admin/cursos/${requireValue(courseId, "course id")}/editar`)
  const lessonRow = page.locator("ol > li").filter({ hasText: lessonTitle }).first()
  await expect(lessonRow.getByTestId("lesson-status")).toHaveText(/listo/i, {
    timeout: 2 * 60_000,
  })

  await expect
    .poll(
      async () => {
        const lesson = await getLessonByTitle(
          requireValue(courseId, "course id"),
          lessonTitle
        )

        return (
          lesson?.bunny_video_id === expectedVideoId &&
          lesson?.bunny_status === "ready" &&
          !lesson?.pending_bunny_video_id
        )
      },
      { timeout: 2 * 60_000 }
    )
    .toBe(true)
}

async function openPublicPreview(page: Page) {
  await page.goto(`/cursos/${courseSlug}`)
  await expect(page.getByRole("heading", { name: courseTitle })).toBeVisible()
  await expect(page.getByRole("heading", { name: /vista previa/i })).toBeVisible()

  const previewFrame = page.locator("iframe").first()
  await expect(previewFrame).toBeVisible()
  return previewFrame
}

test.describe.serial("Bunny real integration", () => {
  test.skip(!bunnyEnabled, "Set PLAYWRIGHT_BUNNY_ENABLED=1 to run the real Bunny suite.")
  test.setTimeout(20 * 60_000)

  test.beforeAll(async () => {
    ensureBunnyEnv()
    await ensureFixtureExists(fixturePath)
    await ensureBusinessFixtures()

    const instructor = await getInstructorBySlug(qaFixtures.danceInstructorSlug)
    if (!instructor?.id) {
      throw new Error("QA seeded instructor not found for Bunny integration suite.")
    }
  })

  test.afterAll(async () => {
    await Promise.allSettled([
      cleanupCoursesBySlugPrefix(courseSlug),
      ...Array.from(createdVideoIds).map((videoId) => deleteBunnyVideo(videoId)),
    ])
  })

  test("setup Bunny real upload using the local fixture", async ({ request }) => {
    helperPreviewVideoId = await createBunnyVideo(previewVideoTitle)
    createdVideoIds.add(helperPreviewVideoId)

    await uploadVideoFile(helperPreviewVideoId, fixturePath)
    await waitForBunnyVideoReady(helperPreviewVideoId)

    const helperSignedUrl = buildSignedEmbedUrl(helperPreviewVideoId)

    expect(helperSignedUrl).toContain("https://iframe.mediadelivery.net/embed/")
    expect(helperSignedUrl).toContain(helperPreviewVideoId)
    expect(helperSignedUrl).toContain("token=")
    expect(helperSignedUrl).toContain("expires=")

    const embedResponse = await request.get(helperSignedUrl)
    expect(embedResponse.ok()).toBe(true)
  })

  test("creates a course and uploads its initial Bunny preview from admin", async ({
    page,
  }) => {
    const instructor = requireValue(
      await getInstructorBySlug(qaFixtures.danceInstructorSlug),
      "dance instructor"
    )

    await loginAsAdmin(page)
    await page.goto("/admin/cursos/nuevo")

    await page.getByLabel(/titulo/i).fill(courseTitle)
    await page.getByLabel(/descripcion corta/i).fill(
      "Curso de QA para validar el preview Bunny administrado."
    )
    await page.getByLabel(/descripcion completa/i).fill(
      "Curso temporal creado por la suite Bunny para validar previews, lecciones y estados."
    )

    await page.locator("#category").click()
    await page.getByRole("option", { name: /^baile$/i }).click()
    await page.locator("#instructorId").click()
    await page.getByRole("option", { name: instructor.full_name }).click()
    await page.locator("#isFree").click()

    await page.getByRole("button", { name: /crear curso/i }).click()
    await expect(page).toHaveURL(/\/admin\/cursos\/.+\/editar/)

    const matchedCourseId = page.url().match(/\/admin\/cursos\/([^/]+)\/editar/)
    courseId = matchedCourseId?.[1] ?? null
    requireValue(courseId, "course id from edit URL")

    await page.locator("#course-preview-upload").setInputFiles(fixturePath)
    await page.getByRole("button", { name: /subir vista previa/i }).click()

    await expect(
      page.getByRole("button", { name: /subiendo archivo/i })
    ).toBeVisible()
    await expect(page.getByTestId("course-preview-status")).toHaveText(
      /procesando/i,
      { timeout: 5 * 60_000 }
    )

    await expect
      .poll(
        async () => {
          const course = await getCourseById(requireValue(courseId, "course id"))
          return course?.preview_status === "processing"
            ? course.preview_bunny_video_id
            : null
        },
        { timeout: 60_000 }
      )
      .not.toBeNull()

    activePreviewVideoId = requireValue(
      (await getCourseById(requireValue(courseId, "course id")))
        ?.preview_bunny_video_id,
      "initial course preview video id"
    )
    createdVideoIds.add(requireValue(activePreviewVideoId, "active preview video id"))

    await waitForPreviewPromotion(
      page,
      requireValue(activePreviewVideoId, "active preview video id")
    )

    await page.locator("#isPublished").click()
    await page.getByRole("button", { name: /guardar cambios/i }).click()
    await expect(page.getByText(/curso actualizado exitosamente/i)).toBeVisible()

    await expect
      .poll(
        async () => (await getCourseBySlug(courseSlug))?.is_published ?? false,
        { timeout: 30_000 }
      )
      .toBe(true)

    const previewFrame = await openPublicPreview(page)
    const previewSrc = requireValue(
      await previewFrame.getAttribute("src"),
      "preview iframe src"
    )

    expect(previewSrc).toContain(requireValue(activePreviewVideoId, "active preview"))

    const previewHeadingBox = await page
      .getByRole("heading", { name: /vista previa/i })
      .boundingBox()
    const descriptionHeadingBox = await page
      .getByRole("heading", { name: /descripcion/i })
      .boundingBox()

    expect(previewHeadingBox?.y).toBeLessThan(descriptionHeadingBox?.y ?? Infinity)
  })

  test("replaces the course preview without breaking the active public preview", async ({
    page,
  }) => {
    const previousPreviewId = requireValue(activePreviewVideoId, "active preview video id")

    await loginAsAdmin(page)
    await page.goto(`/admin/cursos/${requireValue(courseId, "course id")}/editar`)

    await page.locator("#course-preview-upload").setInputFiles(fixturePath)
    await page.getByRole("button", { name: /reemplazar vista previa/i }).click()

    await expect(page.getByText(/reemplazando/i).first()).toBeVisible()

    await expect
      .poll(
        async () => {
          const course = await getCourseById(requireValue(courseId, "course id"))
          return course?.pending_preview_bunny_video_id ?? null
        },
        { timeout: 60_000 }
      )
      .not.toBeNull()

    const nextPreviewId = requireValue(
      await getCourseById(requireValue(courseId, "course id")).then(
        (course) => course?.pending_preview_bunny_video_id
      ),
      "pending preview video id"
    )
    createdVideoIds.add(nextPreviewId)

    expect(nextPreviewId).not.toBe(previousPreviewId)
    expect(
      await getCourseById(requireValue(courseId, "course id")).then(
        (course) => course?.preview_last_checked_at ?? null
      )
    ).toBeNull()

    const previewFrameBeforePromotion = await openPublicPreview(page)
    const previewSrcBeforePromotion = requireValue(
      await previewFrameBeforePromotion.getAttribute("src"),
      "preview iframe before promotion"
    )
    expect(previewSrcBeforePromotion).toContain(previousPreviewId)

    let firstPreviewCheckAt: string | null = null
    await expect
      .poll(
        async () => {
          firstPreviewCheckAt = await getCourseById(
            requireValue(courseId, "course id")
          ).then((course) => course?.preview_last_checked_at ?? null)
          return firstPreviewCheckAt
        },
        { timeout: 30_000 }
      )
      .not.toBeNull()

    await openPublicPreview(page)
    const secondPreviewCheckAt = await getCourseById(
      requireValue(courseId, "course id")
    ).then((course) => course?.preview_last_checked_at ?? null)
    expect(secondPreviewCheckAt).toBe(
      requireValue(firstPreviewCheckAt, "preview first check timestamp")
    )

    await waitForPreviewPromotion(page, nextPreviewId)
    activePreviewVideoId = nextPreviewId

    const previewFrameAfterPromotion = await openPublicPreview(page)
    const previewSrcAfterPromotion = requireValue(
      await previewFrameAfterPromotion.getAttribute("src"),
      "preview iframe after promotion"
    )
    expect(previewSrcAfterPromotion).toContain(nextPreviewId)

    await expect
      .poll(async () => getBunnyVideo(previousPreviewId), { timeout: 60_000 })
      .toBeNull()
  })

  test("public detail autocorrige un preview marcado como processing cuando Bunny ya termino", async ({
    page,
  }) => {
    const currentPreviewId = requireValue(
      activePreviewVideoId,
      "active preview video id"
    )
    const currentCourseId = requireValue(courseId, "course id")

    const { error: stalePreviewError } = await e2eSupabase
      .from("courses")
      .update({
        preview_status: "processing",
        preview_last_checked_at: null,
        preview_last_state_changed_at: new Date(
          Date.now() - 5 * 60_000
        ).toISOString(),
        preview_upload_error: null,
      })
      .eq("id", currentCourseId)

    expect(stalePreviewError).toBeNull()

    const previewFrame = await openPublicPreview(page)
    const previewSrc = requireValue(
      await previewFrame.getAttribute("src"),
      "public preview iframe src after stale preview correction"
    )
    expect(previewSrc).toContain(currentPreviewId)

    await expect
      .poll(
        async () => {
          const course = await getCourseById(currentCourseId)
          return {
            previewStatus: course?.preview_status ?? null,
            previewLastCheckedAt: course?.preview_last_checked_at ?? null,
          }
        },
        { timeout: 30_000 }
      )
      .toMatchObject({
        previewStatus: "ready",
      })
  })

  test("creates a free lesson with a real Bunny upload and reflects processing state", async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto(`/admin/cursos/${requireValue(courseId, "course id")}/editar`)

    await page.getByRole("button", { name: /agregar leccion/i }).click()

    const dialog = page.getByRole("dialog", { name: /agregar leccion/i })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel(/titulo/i).fill(lessonTitle)
    await dialog.getByLabel(/descripcion/i).fill(
      "Leccion gratuita temporal para la suite Bunny."
    )
    await dialog.locator("#lesson-isFree").click()
    await dialog.locator("#lesson-video").setInputFiles(fixturePath)
    await dialog.getByRole("button", { name: /crear leccion/i }).click()

    await expect(dialog).not.toBeVisible({ timeout: 5 * 60_000 })

    const lessonRow = page.locator("ol > li").filter({ hasText: lessonTitle }).first()
    await expect(lessonRow).toBeVisible()
    await expect(lessonRow.getByText(/procesando/i)).toBeVisible()

    const lesson = requireValue(
      await getLessonByTitle(requireValue(courseId, "course id"), lessonTitle),
      "created lesson"
    )

    activeLessonVideoId = lesson.bunny_video_id
    createdVideoIds.add(requireValue(activeLessonVideoId, "active lesson video id"))

    await page.goto(`/cursos/${courseSlug}`)
    const lessonButton = page.getByRole("button", { name: new RegExp(lessonTitle, "i") })
    await expect(lessonButton).toBeVisible()
    await lessonButton.click()

    const lessonDialog = page.getByRole("dialog", { name: new RegExp(lessonTitle, "i") })
    await expect(lessonDialog).toBeVisible()
    await expect(
      lessonDialog.getByText(/todavia se esta procesando|todavia no esta listo/i)
    ).toBeVisible()

    await waitForLessonPromotion(
      page,
      requireValue(activeLessonVideoId, "active lesson video id")
    )

    await page.goto(`/admin/cursos/${requireValue(courseId, "course id")}/editar`)
    const readyLessonRow = page.locator("ol > li").filter({ hasText: lessonTitle }).first()
    await expect(readyLessonRow.getByText(/listo/i)).toBeVisible()

    await page.goto(`/cursos/${courseSlug}`)
    await page.getByRole("button", { name: new RegExp(lessonTitle, "i") }).click()
    const readyDialog = page.getByRole("dialog", { name: new RegExp(lessonTitle, "i") })
    const lessonFrame = readyDialog.locator("iframe")
    await expect(lessonFrame).toBeVisible()
  })

  test("free lesson dialog autocorrige una leccion marcada como processing cuando Bunny ya termino", async ({
    page,
  }) => {
    const currentCourseId = requireValue(courseId, "course id")

    const lesson = requireValue(
      await getLessonByTitle(currentCourseId, lessonTitle),
      "ready lesson before stale processing replay"
    )

    const { error: staleLessonError } = await e2eSupabase
      .from("lessons")
      .update({
        bunny_status: "processing",
        bunny_last_checked_at: null,
        bunny_last_state_changed_at: new Date(
          Date.now() - 5 * 60_000
        ).toISOString(),
        video_upload_error: null,
      })
      .eq("id", lesson.id)

    expect(staleLessonError).toBeNull()

    await page.goto(`/cursos/${courseSlug}`)
    await page.getByRole("button", { name: new RegExp(lessonTitle, "i") }).click()
    const lessonDialog = page.getByRole("dialog", { name: new RegExp(lessonTitle, "i") })
    const lessonFrame = lessonDialog.locator("iframe")
    await expect(lessonFrame).toBeVisible({ timeout: 30_000 })

    await expect
      .poll(
        async () => {
          const refreshedLesson = await getLessonByTitle(currentCourseId, lessonTitle)
          return {
            bunnyStatus: refreshedLesson?.bunny_status ?? null,
            bunnyLastCheckedAt: refreshedLesson?.bunny_last_checked_at ?? null,
          }
        },
        { timeout: 30_000 }
      )
      .toMatchObject({
        bunnyStatus: "ready",
      })
  })

  test("replaces the lesson video while keeping the previous video active until promotion", async ({
    page,
  }) => {
    const previousLessonVideoId = requireValue(activeLessonVideoId, "active lesson video id")

    await loginAsAdmin(page)
    await page.goto(`/admin/cursos/${requireValue(courseId, "course id")}/editar`)

    const lessonRow = page.locator("ol > li").filter({ hasText: lessonTitle }).first()
    await lessonRow.getByRole("button", { name: /editar/i }).click()

    const editDialog = page.getByRole("dialog", { name: /editar leccion/i })
    await expect(editDialog).toBeVisible()
    await editDialog.locator("#lesson-replaceVideo").click()
    await editDialog.locator("#lesson-video-replace").setInputFiles(fixturePath)
    await editDialog.getByRole("button", { name: /guardar cambios/i }).click()

    await expect(editDialog).not.toBeVisible({ timeout: 5 * 60_000 })
    await expect(lessonRow.getByText(/reemplazando/i)).toBeVisible()

    await expect
      .poll(
        async () => {
          const lesson = await getLessonByTitle(
            requireValue(courseId, "course id"),
            lessonTitle
          )

          return lesson?.pending_bunny_video_id ?? null
        },
        { timeout: 60_000 }
      )
      .not.toBeNull()

    const pendingLessonVideoId = requireValue(
      await getLessonByTitle(
        requireValue(courseId, "course id"),
        lessonTitle
      ).then((lesson) => lesson?.pending_bunny_video_id ?? null),
      "pending lesson video id"
    )
    createdVideoIds.add(pendingLessonVideoId)

    const lessonBeforePromotion = requireValue(
      await getLessonByTitle(requireValue(courseId, "course id"), lessonTitle),
      "lesson before promotion"
    )
    expect(lessonBeforePromotion.bunny_video_id).toBe(previousLessonVideoId)

    await page.goto(`/cursos/${courseSlug}`)
    const lessonButton = page.getByRole("button", { name: new RegExp(lessonTitle, "i") })
    await lessonButton.click()
    const previewDialog = page.getByRole("dialog", { name: new RegExp(lessonTitle, "i") })
    const lessonFrameBeforePromotion = previewDialog.locator("iframe")
    await expect(lessonFrameBeforePromotion).toBeVisible()
    const srcBeforePromotion = requireValue(
      await lessonFrameBeforePromotion.getAttribute("src"),
      "lesson iframe before promotion"
    )
    expect(srcBeforePromotion).toContain(previousLessonVideoId)

    await waitForLessonPromotion(page, pendingLessonVideoId)
    activeLessonVideoId = pendingLessonVideoId

    await page.goto(`/cursos/${courseSlug}`)
    await page.getByRole("button", { name: new RegExp(lessonTitle, "i") }).click()
    const finalDialog = page.getByRole("dialog", { name: new RegExp(lessonTitle, "i") })
    const lessonFrameAfterPromotion = finalDialog.locator("iframe")
    await expect(lessonFrameAfterPromotion).toBeVisible()
    const srcAfterPromotion = requireValue(
      await lessonFrameAfterPromotion.getAttribute("src"),
      "lesson iframe after promotion"
    )
    expect(srcAfterPromotion).toContain(pendingLessonVideoId)

    await expect
      .poll(async () => getBunnyVideo(previousLessonVideoId), { timeout: 60_000 })
      .toBeNull()
  })

  test("deletes the course and removes its Bunny preview and lesson assets", async ({
    page,
  }) => {
    const previewVideoIdToDelete = requireValue(
      activePreviewVideoId,
      "preview video id before course deletion"
    )
    const lessonVideoIdToDelete = requireValue(
      activeLessonVideoId,
      "lesson video id before course deletion"
    )

    await loginAsAdmin(page)
    await page.goto("/admin/cursos")

    const row = page.locator("tr").filter({ hasText: courseTitle }).first()
    await expect(row).toBeVisible()
    await row.getByRole("button", { name: /eliminar/i }).click()

    const deleteDialog = page.getByRole("dialog", { name: /eliminar curso/i })
    await expect(deleteDialog).toBeVisible()
    await deleteDialog
      .getByRole("button", { name: /confirmar eliminacion/i })
      .click()

    await expect(page).toHaveURL(/\/admin\/cursos$/)

    await expect
      .poll(() => getCourseBySlug(courseSlug), { timeout: 60_000 })
      .toBeNull()

    await expect
      .poll(async () => getBunnyVideo(previewVideoIdToDelete), { timeout: 60_000 })
      .toBeNull()
    await expect
      .poll(async () => getBunnyVideo(lessonVideoIdToDelete), { timeout: 60_000 })
      .toBeNull()

    activePreviewVideoId = null
    activeLessonVideoId = null
    courseId = null
  })
})
