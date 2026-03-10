import { expect, type Page } from "@playwright/test"

import { qaCredentials } from "./db"

function decodeAuthCookie(value: string) {
  const raw = value.startsWith("base64-")
    ? Buffer.from(value.slice("base64-".length), "base64url").toString("utf8")
    : value

  return JSON.parse(raw) as {
    access_token: string
    refresh_token: string
  }
}

function encodeAuthCookie(payload: Record<string, unknown>) {
  return `base64-${Buffer.from(JSON.stringify(payload)).toString("base64url")}`
}

export async function loginAsUser(page: Page) {
  await page.goto("/login")
  await page.getByLabel(/^email$/i).fill(qaCredentials.userEmail)
  await page.getByLabel(/contrasena/i).fill(qaCredentials.userPassword)
  const submitButton = page.getByRole("button", { name: /iniciar sesion$/i })
  await expect(submitButton).toBeEnabled()
  await submitButton.click()
  await expect(page).toHaveURL(/\/dashboard/)
}

export async function loginAsAdmin(page: Page) {
  await page.goto("/login")
  await page.getByLabel(/^email$/i).fill(qaCredentials.adminEmail)
  await page.getByLabel(/contrasena/i).fill(qaCredentials.adminPassword)
  const submitButton = page.getByRole("button", { name: /iniciar sesion$/i })
  await expect(submitButton).toBeEnabled()
  await submitButton.click()
  await expect(page).toHaveURL(/\/admin/)
}

export async function degradeAccessTokenCookie(page: Page) {
  const authCookie = (await page.context().cookies()).find(
    (cookie) =>
      cookie.name.includes("auth-token") && !cookie.name.match(/\.\d+$/)
  )

  expect(authCookie, "expected a single Supabase auth cookie").toBeTruthy()

  const parsed = decodeAuthCookie(authCookie!.value)
  const degradedValue = encodeAuthCookie({
    ...parsed,
    access_token: "broken.invalid.token",
  })

  await page.context().addCookies([
    {
      ...authCookie!,
      value: degradedValue,
    },
  ])
}

export async function logoutCurrentUser(page: Page) {
  const desktopTrigger = page.getByRole("button", { name: /abrir menu de usuario/i })
  if (await desktopTrigger.isVisible().catch(() => false)) {
    await desktopTrigger.click()
    await page.getByTestId("logout-button").click()
  } else {
    await page.getByTestId("mobile-bottom-menu-trigger").click()
    await page.getByTestId("mobile-logout-button").click()
  }

  await expect(page).toHaveURL(/\/$/)
}

export async function goToLearningDashboard(page: Page) {
  const desktopTrigger = page.getByRole("button", { name: /abrir menu de usuario/i })
  if (await desktopTrigger.isVisible().catch(() => false)) {
    await desktopTrigger.click()
    const dashboardMenuItem = page.getByRole("menuitem").filter({ hasText: /mi aprendizaje/i })
    if (await dashboardMenuItem.isVisible().catch(() => false)) {
      await dashboardMenuItem.click()
    } else {
      await page.getByText(/mi aprendizaje/i).click()
    }
  } else {
    await page.getByRole("link", { name: /^aprendizaje$/i }).click()
  }

  await expect(page).toHaveURL(/\/dashboard$/)
}
