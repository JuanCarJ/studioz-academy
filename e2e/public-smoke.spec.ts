import { expect, test } from "@playwright/test"

const publicRoutes = [
  { path: "/", heading: /aprende baile y tatuaje/i },
  { path: "/servicios", heading: /sitio informativo y lms/i },
  { path: "/galeria", heading: /trabajo, comunidad y momentos/i },
  { path: "/noticias", heading: /contenido editorial/i },
  { path: "/eventos", heading: /agenda publica/i },
  { path: "/contacto", heading: /habla con studio z/i },
]

for (const route of publicRoutes) {
  test(`renderiza ${route.path}`, async ({ page }) => {
    await page.goto(route.path)
    await expect(
      page.getByRole("heading", { level: 1, name: route.heading })
    ).toBeVisible()
  })
}

test("noticias permite navegar al detalle cuando existe un post publicado", async ({
  page,
}) => {
  await page.goto("/noticias")
  const links = page.locator('a[href^="/noticias/"]')

  if ((await links.count()) === 0) {
    test.skip(true, "No hay noticias publicadas en este entorno.")
  }

  await links.first().click()
  await expect(page).toHaveURL(/\/noticias\/.+/)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
})

test("contacto muestra el formulario persistente", async ({ page }) => {
  await page.goto("/contacto")
  await expect(page.getByLabel(/nombre completo/i)).toBeVisible()
  await expect(page.getByLabel(/^email$/i)).toBeVisible()
  await expect(page.getByLabel(/mensaje/i)).toBeVisible()
})
