import { expect, test } from "@playwright/test"

const publicRoutes = [
  { path: "/", heading: /aprende baile y tatuaje online/i },
  { path: "/servicios", heading: /baile y tattoo con una identidad propia/i },
  { path: "/galeria", heading: /trabajo, comunidad y momentos/i },
  { path: "/noticias", heading: /contenido editorial/i },
  { path: "/eventos", heading: /agenda publica/i },
  { path: "/contacto", heading: /datos de contacto de studio z/i },
]

for (const route of publicRoutes) {
  test(`renderiza ${route.path}`, async ({ page }) => {
    await page.goto(route.path)
    await expect(
      page.getByRole("heading", { level: 1, name: route.heading })
    ).toBeVisible()
  })
}

test("home muestra el split temprano y el cierre final", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { level: 3, name: /quiero aprender baile/i })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { level: 3, name: /quiero aprender tatuaje/i })
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: /explorar cursos online/i })
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: /ver cursos presenciales de baile/i })
  ).toBeVisible()
})

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

test("contacto muestra canales directos y ubicaciones", async ({ page }) => {
  await page.goto("/contacto")
  await expect(
    page.getByRole("heading", { level: 2, name: /academia de baile/i })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { level: 2, name: /studio z tattoo/i })
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: /abrir google maps para/i }).first()
  ).toBeVisible()
})
