import { expect, type Page } from "@playwright/test"

import { qaCredentials } from "./db"

export async function loginAsUser(page: Page) {
  await page.goto("/login")
  await page.getByLabel(/^email$/i).fill(qaCredentials.userEmail)
  await page.getByLabel(/contrasena/i).fill(qaCredentials.userPassword)
  await page.getByRole("button", { name: /iniciar sesion$/i }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

export async function loginAsAdmin(page: Page) {
  await page.goto("/login")
  await page.getByLabel(/^email$/i).fill(qaCredentials.adminEmail)
  await page.getByLabel(/contrasena/i).fill(qaCredentials.adminPassword)
  await page.getByRole("button", { name: /iniciar sesion$/i }).click()
  await expect(page).toHaveURL(/\/admin/)
}

