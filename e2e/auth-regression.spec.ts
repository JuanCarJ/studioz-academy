import { expect, test, type Page } from "@playwright/test"

import {
  deleteAuthUserByEmail,
  ensureAuthUser,
  e2eSupabase,
  markProfileAsDeleted,
} from "./support/db"

const runId = Date.now().toString(36)
const createdEmails = new Set<string>()

function buildEmail(label: string) {
  return `qa.auth.${label}.${runId}@qa.studioz.local`
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel(/^email$/i).fill(email)
  await page.getByLabel(/contrasena/i).fill(password)
  await page.getByRole("button", { name: /iniciar sesion$/i }).click()
}

test.describe.serial("auth regressions", () => {
  test.afterAll(async () => {
    await Promise.allSettled(
      Array.from(createdEmails).map((email) => deleteAuthUserByEmail(email))
    )
  })

  test("registro muestra mensaje seguro y accionable para email ya existente", async ({
    page,
  }) => {
    const email = buildEmail("duplicate")
    createdEmails.add(email)

    await ensureAuthUser({
      email,
      password: "QaAuth2026!",
      fullName: "Cuenta Duplicada QA",
    })

    await page.goto("/registro")
    await page.getByLabel(/nombre completo/i).fill("Persona Duplicada")
    await page.getByLabel(/^email$/i).fill(email)
    await page.getByLabel(/contrasena/i).fill("OtraClave2026!")
    await page.getByRole("checkbox", { name: /autorizo el tratamiento/i }).click()
    await page.getByRole("button", { name: /crear cuenta/i }).click()

    await expect(
      page.getByText(
        /no se pudo crear la cuenta\. si ya te registraste antes, inicia sesion o recupera tu contrasena\./i
      )
    ).toBeVisible()
    await expect(page).toHaveURL(/\/registro/)
  })

  test("registro rechaza nombres de un solo caracter", async ({ page }) => {
    await page.goto("/registro")
    await page.getByLabel(/nombre completo/i).fill("g")
    await page.getByLabel(/^email$/i).fill(buildEmail("short-name"))
    await page.getByLabel(/contrasena/i).fill("QaAuth2026!")
    await page.getByRole("checkbox", { name: /autorizo el tratamiento/i }).click()
    await page.getByRole("button", { name: /crear cuenta/i }).click()

    await expect(
      page.getByText(/el nombre debe tener entre 2 y 80 caracteres\.|el nombre debe incluir al menos 2 letras\./i)
    ).toBeVisible()
    await expect(page).toHaveURL(/\/registro/)
  })

  test("registro acepta emails validos con puntos antes de la arroba", async ({ page }) => {
    const email = buildEmail("correo.valido")
    await page.goto("/registro")
    await page.getByLabel(/nombre completo/i).fill("Correo Valido QA")
    await page.getByLabel(/^email$/i).fill(email)
    await page.getByLabel(/contrasena/i).fill("QaAuth2026!")
    await page.getByRole("checkbox", { name: /autorizo el tratamiento/i }).click()

    const emailInput = page.getByLabel(/^email$/i)
    await expect(emailInput).toHaveValue(email)
    await expect
      .poll(() =>
        emailInput.evaluate(
          (input) => (input as HTMLInputElement).validity.typeMismatch
        )
      )
      .toBe(false)
  })

  test("login bloquea cuentas marcadas como eliminadas", async ({ page }) => {
    const email = buildEmail("deleted-login")
    const password = "QaAuth2026!"
    createdEmails.add(email)

    await ensureAuthUser({
      email,
      password,
      fullName: "Cuenta Eliminada QA",
    })
    await markProfileAsDeleted(email)

    await login(page, email, password)

    await expect(page).toHaveURL(/\/login\?error=account-deleted/)
    await expect(page.getByText(/esta cuenta fue eliminada/i)).toBeVisible()
  })

  test("el flujo de eliminacion borra la identidad autenticable", async ({ page }) => {
    const email = buildEmail("delete-flow")
    const password = "QaAuth2026!"
    createdEmails.add(email)

    const userId = await ensureAuthUser({
      email,
      password,
      fullName: "Flujo Eliminacion QA",
    })

    await login(page, email, password)
    await expect(page).toHaveURL(/\/dashboard/)
    await page.goto("/dashboard/perfil")
    await page.getByRole("button", { name: /solicitar eliminacion de cuenta/i }).click()
    await page.getByRole("button", { name: /si, eliminar mi cuenta/i }).click()

    await expect(page).toHaveURL(/\/$/)

    await expect
      .poll(async () => {
        const { data } = await e2eSupabase
          .from("profiles")
          .select("deleted_at")
          .eq("id", userId)
          .maybeSingle()

        return data?.deleted_at ?? null
      })
      .not.toBeNull()

    await login(page, email, password)
    await expect(page).toHaveURL(/\/login/)
  })

  test("login muestra errores explicitos de OAuth callback", async ({ page }) => {
    await page.goto("/login?error=oauth")
    await expect(page.getByText(/no se pudo iniciar el acceso con google/i)).toBeVisible()

    await page.goto("/login?error=callback")
    await expect(page.getByText(/no se pudo completar el acceso con google/i)).toBeVisible()
  })
})
