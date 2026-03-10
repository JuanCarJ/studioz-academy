import { expect, test } from "@playwright/test"

import { loginAsAdmin, loginAsUser } from "./support/auth"
import {
  e2eSupabase,
  ensureBusinessFixtures,
  getInstructorBySlug,
  qaCredentials,
  qaFixtures,
  slugify,
} from "./support/db"

const runId = Date.now().toString(36)
const avatarPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO0p7x8AAAAASUVORK5CYII=",
  "base64"
)
const transientInstructorName = `QA Avatar Instructor ${runId}`
const transientInstructorSlug = slugify(transientInstructorName)

test.describe.serial("Instructor Avatar", () => {
  test.skip(
    ({ isMobile }) => isMobile,
    "Admin suite mutates shared DB; runs once on desktop."
  )

  test.beforeAll(async () => {
    await ensureBusinessFixtures()
  })

  test.afterAll(async () => {
    // Cleanup transient instructor created during tests
    const inst = await getInstructorBySlug(transientInstructorSlug)
    if (inst?.id) {
      await e2eSupabase.from("instructors").delete().eq("id", inst.id)
    }
  })

  test("admin creates instructor with avatar — preview, table, and DB", async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto("/admin/instructores")

    // Upload avatar and verify live preview appears
    await page.locator("#avatar").setInputFiles({
      name: `avatar-create-${runId}.png`,
      mimeType: "image/png",
      buffer: avatarPng,
    })
    await expect(
      page.locator('.h-16.w-16 img[alt="Avatar del instructor"]')
    ).toBeVisible()

    // Fill remaining fields
    await page.getByLabel(/nombre completo/i).fill(transientInstructorName)
    await page.getByLabel(/^bio$/i).fill("Instructor QA avatar test.")
    await page.getByLabel(/especialidades/i).fill("Salsa, Bachata")
    await page.getByLabel(/anos de experiencia/i).fill("5")
    await page.getByRole("button", { name: /crear instructor/i }).click()

    // Verify created in DB with avatar_url pointing to Supabase storage
    await expect
      .poll(async () => {
        const inst = await getInstructorBySlug(transientInstructorSlug)
        return inst?.avatar_url?.includes("/storage/v1/object/public/avatars/")
          ? "has_avatar"
          : "no_avatar"
      })
      .toBe("has_avatar")

    // Verify avatar visible in table row after reload
    await page.reload()
    const row = page.getByRole("row", {
      name: new RegExp(transientInstructorName),
    })
    await expect(row).toBeVisible()
    await expect(row.locator("img")).toBeVisible()
  })

  test("admin table shows edit button that navigates to edit page", async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto("/admin/instructores")

    const row = page.getByRole("row", {
      name: new RegExp(qaFixtures.danceInstructorName),
    })
    await expect(row).toBeVisible()

    const editLink = row.getByRole("link", { name: /editar/i })
    await expect(editLink).toBeVisible()
    await editLink.click()

    await expect(page).toHaveURL(/\/admin\/instructores\/.+\/editar/)
    await expect(
      page.getByRole("heading", { name: /editar instructor/i })
    ).toBeVisible()
    await expect(
      page.getByText(qaFixtures.danceInstructorName)
    ).toBeVisible()
  })

  test("admin edits instructor avatar via edit page", async ({ page }) => {
    const instructor = await getInstructorBySlug(
      qaFixtures.danceInstructorSlug
    )
    expect(instructor?.id).toBeTruthy()

    await loginAsAdmin(page)
    await page.goto(`/admin/instructores/${instructor!.id}/editar`)

    // Upload new avatar
    await page.locator("#avatar").setInputFiles({
      name: `avatar-edit-${runId}.png`,
      mimeType: "image/png",
      buffer: avatarPng,
    })

    // Verify preview updates
    await expect(
      page.locator('.h-16.w-16 img[alt="Avatar del instructor"]')
    ).toBeVisible()

    await page.getByRole("button", { name: /guardar cambios/i }).click()
    await expect(
      page.getByText(/instructor actualizado/i)
    ).toBeVisible()

    // Verify avatar_url updated in DB to Supabase storage path
    await expect
      .poll(async () => {
        const inst = await getInstructorBySlug(
          qaFixtures.danceInstructorSlug
        )
        return inst?.avatar_url?.includes(
          "/storage/v1/object/public/avatars/instructors/"
        )
          ? "updated"
          : "not_updated"
      })
      .toBe("updated")
  })

  test("edit page back link returns to instructors list", async ({
    page,
  }) => {
    const instructor = await getInstructorBySlug(
      qaFixtures.danceInstructorSlug
    )

    await loginAsAdmin(page)
    await page.goto(`/admin/instructores/${instructor!.id}/editar`)

    const backLink = page.getByRole("link", {
      name: /volver a instructores/i,
    })
    await expect(backLink).toBeVisible()
    await backLink.click()
    await expect(page).toHaveURL(/\/admin\/instructores$/)
  })

  test("edit page redirects to list when instructor ID does not exist", async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto(
      "/admin/instructores/00000000-0000-0000-0000-000000000000/editar"
    )
    await expect(page).toHaveURL(/\/admin\/instructores$/)
  })

  test("player page shows instructor info with link for enrolled course", async ({
    page,
  }) => {
    await loginAsUser(page)
    await page.goto(
      `/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`
    )

    // Verify instructor name is visible
    await expect(
      page.getByText(qaFixtures.danceInstructorName)
    ).toBeVisible()

    // Verify instructor link points to public profile
    const instructorLink = page.getByRole("link", {
      name: new RegExp(qaFixtures.danceInstructorName),
    })
    await expect(instructorLink).toBeVisible()
    await expect(instructorLink).toHaveAttribute(
      "href",
      `/instructores/${qaFixtures.danceInstructorSlug}`
    )
  })

  test("instructor without avatar shows fallback initial in table", async ({
    page,
  }) => {
    // Create instructor without avatar
    const noAvatarName = `QA NoAvatar ${runId}`
    const noAvatarSlug = slugify(noAvatarName)

    await loginAsAdmin(page)
    await page.goto("/admin/instructores")

    await page.getByLabel(/nombre completo/i).fill(noAvatarName)
    await page.getByRole("button", { name: /crear instructor/i }).click()

    await expect
      .poll(async () =>
        getInstructorBySlug(noAvatarSlug).then((inst) => !!inst)
      )
      .toBe(true)

    await page.reload()

    const row = page.getByRole("row", {
      name: new RegExp(noAvatarName),
    })
    await expect(row).toBeVisible()

    // Avatar fallback should show the initial letter (no <img>)
    const avatar = row.locator(".h-8.w-8")
    await expect(avatar).toBeVisible()
    await expect(avatar.locator("img")).not.toBeVisible()
    await expect(avatar).toContainText(noAvatarName.charAt(0).toUpperCase())

    // Verify DB has no avatar_url
    const inst = await getInstructorBySlug(noAvatarSlug)
    expect(inst?.avatar_url).toBeNull()

    // Cleanup
    if (inst?.id) {
      await e2eSupabase.from("instructors").delete().eq("id", inst.id)
    }
  })
})
