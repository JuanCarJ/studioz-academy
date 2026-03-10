import { expect, test } from "@playwright/test"

import {
  degradeAccessTokenCookie,
  loginAsUser,
} from "./support/auth"
import {
  ensureBusinessFixtures,
  qaFixtures,
} from "./support/db"

test.describe.serial("User Session Recovery", () => {
  test.beforeAll(async () => {
    await ensureBusinessFixtures()
  })

  test("keeps user signed in during dashboard navigation after token degradation", async ({
    page,
  }) => {
    await loginAsUser(page)
    await page.goto("/dashboard")
    await degradeAccessTokenCookie(page)

    await page.getByRole("link", { name: /mi perfil/i }).click()

    await expect(page).toHaveURL(/\/dashboard\/perfil$/)
    await expect(
      page.getByRole("heading", { name: /mi perfil/i })
    ).toBeVisible()
  })

  test("keeps user signed in on course player and cart after token degradation", async ({
    page,
  }) => {
    await loginAsUser(page)
    await degradeAccessTokenCookie(page)

    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}$`)
    )
    await expect(
      page.getByRole("heading", { name: new RegExp(qaFixtures.paidPrimaryCourseTitle) })
    ).toBeVisible()

    await page.goto("/carrito")
    await expect(page).toHaveURL(/\/carrito$/)
    await expect(
      page.getByRole("heading", { name: /tu carrito esta vacio|carrito de compras/i })
    ).toBeVisible()
  })
})
