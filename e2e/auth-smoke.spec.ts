import { expect, test } from "@playwright/test"

const userEmail = process.env.PLAYWRIGHT_USER_EMAIL
const userPassword = process.env.PLAYWRIGHT_USER_PASSWORD
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD

async function login(page: Parameters<typeof test>[0]["page"], email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel(/^email$/i).fill(email)
  await page.getByLabel(/contrasena/i).fill(password)
  await page.getByRole("button", { name: /iniciar sesion$/i }).click()
}

test("usuario QA puede iniciar sesion y llegar al dashboard", async ({ page }) => {
  test.skip(!userEmail || !userPassword, "Faltan credenciales QA de usuario.")

  await login(page, userEmail!, userPassword!)
  await expect(page).toHaveURL(/\/dashboard/)
})

test("admin QA puede iniciar sesion y llegar al panel", async ({ page }) => {
  test.skip(!adminEmail || !adminPassword, "Faltan credenciales QA de admin.")

  await login(page, adminEmail!, adminPassword!)
  await page.goto("/admin")
  await expect(page).toHaveURL(/\/admin/)
  await expect(
    page.getByRole("heading", { level: 1, name: /panel de administracion/i })
  ).toBeVisible()
})
