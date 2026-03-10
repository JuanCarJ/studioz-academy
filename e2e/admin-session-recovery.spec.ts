import { expect, test } from "@playwright/test"

import {
  degradeAccessTokenCookie,
  loginAsAdmin,
} from "./support/auth"
import {
  ensureBusinessFixtures,
  getCourseBySlug,
  getInstructorBySlug,
  qaFixtures,
} from "./support/db"

test.describe.serial("Admin Session Recovery", () => {
  test.skip(
    ({ isMobile }) => isMobile,
    "Admin recovery suite runs once on desktop."
  )

  test.beforeAll(async () => {
    await ensureBusinessFixtures()
  })

  test("keeps admin signed in when opening instructor edit after token degradation", async ({
    page,
  }) => {
    const instructor = await getInstructorBySlug(qaFixtures.danceInstructorSlug)

    expect(instructor?.id).toBeTruthy()

    await loginAsAdmin(page)
    await page.goto("/admin/instructores")
    await degradeAccessTokenCookie(page)

    const row = page.getByRole("row", {
      name: new RegExp(qaFixtures.danceInstructorName),
    })
    await expect(row).toBeVisible()
    await row.getByRole("link", { name: /editar/i }).click()

    await expect(page).toHaveURL(
      new RegExp(`/admin/instructores/${instructor!.id}/editar$`)
    )
    await expect(
      page.getByRole("heading", { name: /editar instructor/i })
    ).toBeVisible()
  })

  test("keeps admin signed in on direct course edit navigation after token degradation", async ({
    page,
  }) => {
    const course = await getCourseBySlug(qaFixtures.paidPrimaryCourseSlug)

    expect(course?.id).toBeTruthy()

    await loginAsAdmin(page)
    await degradeAccessTokenCookie(page)
    await page.goto(`/admin/cursos/${course!.id}/editar`)

    await expect(page).toHaveURL(
      new RegExp(`/admin/cursos/${course!.id}/editar$`)
    )
    await expect(
      page.getByRole("heading", { name: /editar curso/i })
    ).toBeVisible()
  })
})
