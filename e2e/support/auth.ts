import { expect, type Page } from "@playwright/test"

import { qaCredentials } from "./db"

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
