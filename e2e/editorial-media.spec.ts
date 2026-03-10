import { expect, test } from "@playwright/test"

import { loginAsAdmin } from "./support/auth"
import {
  ensureBusinessFixtures,
  getEventByTitle,
  getEventImages,
  getGalleryItemByCaption,
} from "./support/db"

const runId = Date.now().toString(36)
const galleryName = `QA E2E Temp Gallery ${runId}`
const galleryNameUpdated = `${galleryName} Updated`
const eventTitle = `QA E2E Temp Event ${runId}`

const samplePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO0p7x8AAAAASUVORK5CYII=",
  "base64"
)

const alternatePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4EIwDiqAABhWQO6U0YvrQAAAABJRU5ErkJggg==",
  "base64"
)

test.describe.serial("Editorial media admin", () => {
  test.skip(({ isMobile }) => isMobile, "La suite muta contenido editorial y corre solo en desktop.")

  test.beforeAll(async () => {
    await ensureBusinessFixtures()
  })

  test("admin valida y crea imagen de galeria con orden reciente", async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto("/admin/galeria")

    const createForm = page.getByTestId("gallery-create-form")
    await expect(createForm.locator('input[name="image"]')).toHaveJSProperty(
      "required",
      true
    )
    await createForm.locator('input[name="caption"]').fill(galleryName)
    await createForm.getByRole("button", { name: /crear imagen/i }).click()
    await expect
      .poll(async () => getGalleryItemByCaption(galleryName))
      .toBeNull()

    await createForm.locator('input[name="image"]').setInputFiles({
      name: "gallery-upload.png",
      mimeType: "image/png",
      buffer: samplePng,
    })
    await createForm.getByRole("button", { name: /crear imagen/i }).click()

    await expect
      .poll(async () =>
        getGalleryItemByCaption(galleryName).then((item) => item?.image_url ?? null)
      )
      .not.toBeNull()

    const galleryItem = await getGalleryItemByCaption(galleryName)
    expect(galleryItem?.image_url).toBeTruthy()
    await page.goto("/admin/galeria")

    const updateForm = page.getByTestId(`gallery-update-form-${galleryItem!.id}`)
    const originalImageUrl = galleryItem!.image_url

    await updateForm.locator('input[name="caption"]').fill(galleryNameUpdated)
    await updateForm.getByRole("button", { name: /guardar cambios/i }).click()

    await expect
      .poll(async () => getGalleryItemByCaption(galleryNameUpdated))
      .toMatchObject({
        caption: galleryNameUpdated,
        image_url: originalImageUrl,
      })

    await page.goto("/galeria")
    await expect(page.getByText(galleryNameUpdated)).toBeVisible()

    await page.goto("/")
    await expect(page.getByText(galleryNameUpdated)).toBeVisible()
  })

  test("admin crea evento con varias imagenes, publica inmediato y bloquea dejarlo sin imagenes", async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto("/admin/eventos")

    const createForm = page.getByTestId("event-create-form")
    await createForm.locator('input[name="title"]').fill(eventTitle)
    await createForm
      .locator('input[name="eventDate"]')
      .fill("2026-03-12T18:00")
    await createForm
      .locator('input[name="location"]')
      .fill("Cra. 45 #123-45, Bogota")
    await createForm
      .locator('textarea[name="description"]')
      .fill("Evento temporal QA E2E con carrusel de imagenes.")
    await expect(createForm.locator('input[name="images"]')).toHaveJSProperty(
      "required",
      true
    )

    await createForm.getByRole("button", { name: /crear evento/i }).click()
    await expect
      .poll(async () => getEventByTitle(eventTitle))
      .toBeNull()

    await createForm.locator('input[name="images"]').setInputFiles([
      {
        name: "event-one.png",
        mimeType: "image/png",
        buffer: samplePng,
      },
      {
        name: "event-two.png",
        mimeType: "image/png",
        buffer: alternatePng,
      },
    ])
    await createForm.getByRole("button", { name: /crear evento/i }).click()

    await expect
      .poll(async () => getEventByTitle(eventTitle).then((event) => event?.image_url ?? null))
      .not.toBeNull()

    const event = await getEventByTitle(eventTitle)
    expect(event?.is_published).toBe(true)
    await expect
      .poll(async () => getEventImages(event!.id).then((images) => images.length))
      .toBe(2)

    await page.goto("/eventos")
    await expect(page.getByRole("heading", { name: eventTitle })).toBeVisible()
    await expect(page.getByRole("button", { name: /siguiente/i }).first()).toBeVisible()

    await page.goto("/")
    await expect(page.getByText(eventTitle)).toBeVisible()

    await page.goto("/admin/eventos")
    const updateForm = page.getByTestId(`event-update-form-${event!.id}`)

    await updateForm.locator('input[name="removeImageIds"]').nth(0).check()
    await updateForm.locator('input[name="removeImageIds"]').nth(1).check()
    await updateForm.getByRole("button", { name: /guardar cambios/i }).click()

    await expect(updateForm).toContainText(/debe conservar al menos una imagen/i)
  })
})
