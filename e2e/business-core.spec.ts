import { expect, test } from "@playwright/test"

import { getBestDiscount } from "../src/lib/discounts"
import { loginAsAdmin, loginAsUser } from "./support/auth"
import {
  getActiveDiscountRules,
  ensureReviewForCourse,
  clearUserCart,
  ensureBusinessFixtures,
  getAuditLogsByAction,
  getCartItemsForEmail,
  getContactMessagesBySubject,
  getCourseBySlug,
  getCourseProgress,
  getDiscountRuleByName,
  getEnrollment,
  getInstructorBySlug,
  getLessonProgress,
  getOrderByReference,
  getOutboxEntry,
  getPostBySlug,
  getProfileByEmail,
  getReviewForCourse,
  qaCredentials,
  qaFixtures,
  slugify,
} from "./support/db"

const runId = Date.now().toString(36)
const reviewTextInitial = `QA E2E review inicial ${runId}`
const reviewTextUpdated = `QA E2E review actualizada ${runId}`
const contactSubject = `QA E2E contact ${runId}`
const comboName = `QA E2E Temporal Combo ${runId}`
const comboNameUpdated = `QA E2E Temporal Combo ${runId} Updated`
const newsTitle = `QA E2E Temp News ${runId}`
const newsTitleUpdated = `QA E2E Temp News ${runId} Updated`
const instructorName = `QA E2E Instructor ${runId}`
const courseTitle = `QA E2E Curso Admin ${runId}`

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

test.describe.serial("Business E2E", () => {
  test.skip(({ isMobile }) => isMobile, "La suite de negocio muta una DB compartida y corre una sola vez en desktop.")

  test.beforeAll(async () => {
    await ensureBusinessFixtures()
  })

  test("protege rutas privadas y expone el catalogo con filtros medibles", async ({
    page,
  }) => {
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard/)

    await page.goto("/admin")
    await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin/)

    await page.goto("/cursos?category=baile&search=qa%20e2e&sort=price_desc")
    await expect(
      page.getByRole("heading", { level: 1, name: /cursos de baile/i })
    ).toBeVisible()
    await expect(page.getByText(qaFixtures.paidPrimaryCourseTitle)).toBeVisible()
    await expect(page.getByText(qaFixtures.cartCourseOneTitle)).toBeVisible()
    await expect(page.getByText(qaFixtures.cartCourseTwoTitle)).toBeVisible()
    await expect(
      page.getByText(qaFixtures.freeCourseTitle)
    ).not.toBeVisible()
  })

  test("mantiene contexto add-to-cart tras login y aplica combos en carrito", async ({
    page,
  }) => {
    await clearUserCart(qaCredentials.userEmail)

    await page.goto(`/cursos/${qaFixtures.cartCourseOneSlug}`)
    await page.getByRole("button", { name: /agregar al carrito/i }).click()
    await expect(page).toHaveURL(/\/login\?redirect=/)

    await page.getByLabel(/^email$/i).fill(qaCredentials.userEmail)
    await page.getByLabel(/contrasena/i).fill(qaCredentials.userPassword)
    await page.getByRole("button", { name: /iniciar sesion$/i }).click()

    await expect(page).toHaveURL(/\/carrito/)
    await expect(page.getByText(qaFixtures.cartCourseOneTitle)).toBeVisible()
    await expect
      .poll(async () => (await getCartItemsForEmail(qaCredentials.userEmail)).length)
      .toBe(1)

    await page.goto(`/cursos/${qaFixtures.cartCourseTwoSlug}`)
    await page.getByRole("button", { name: /agregar al carrito/i }).click()
    await expect(
      page.getByRole("link", { name: /ya en tu carrito/i })
    ).toBeVisible()

    await page.goto("/carrito")
    await expect(page.getByText(qaFixtures.cartCourseOneTitle)).toBeVisible()
    await expect(page.getByText(qaFixtures.cartCourseTwoTitle)).toBeVisible()
    const activeRules = await getActiveDiscountRules()
    const expectedDiscount = getBestDiscount(
      [
        { category: "baile", price: 9000000, isFree: false },
        { category: "baile", price: 8000000, isFree: false },
      ],
      activeRules
    )
    expect(expectedDiscount.amount).toBeGreaterThan(0)
    expect(expectedDiscount.rule?.name).toBeTruthy()
    await expect(
      page.getByText(
        new RegExp(
          `Descuento \\(${escapeRegExp(expectedDiscount.rule!.name)}\\)`,
          "i"
        )
      )
    ).toBeVisible()

    await expect
      .poll(async () => (await getCartItemsForEmail(qaCredentials.userEmail)).length)
      .toBe(2)

    await page.getByRole("button", { name: /^quitar$/i }).first().click()
    await expect
      .poll(async () => (await getCartItemsForEmail(qaCredentials.userEmail)).length)
      .toBe(1)

    await page.goto("/carrito")
    await page.getByRole("button", { name: /^quitar$/i }).first().click()
    await expect
      .poll(async () => (await getCartItemsForEmail(qaCredentials.userEmail)).length)
      .toBe(0)

    await expect(
      page.getByRole("heading", { level: 1, name: /tu carrito esta vacio/i })
    ).toBeVisible()
  })

  test("permite inscripcion gratuita y acceso al dashboard del curso", async ({
    page,
  }) => {
    const freeCourse = await getCourseBySlug(qaFixtures.freeCourseSlug)
    expect(freeCourse?.id).toBeTruthy()

    await loginAsUser(page)
    await page.goto(`/cursos/${qaFixtures.freeCourseSlug}`)
    await page.getByRole("button", { name: /inscribirme gratis/i }).click()

    await expect(page).toHaveURL(
      new RegExp(`/dashboard/cursos/${qaFixtures.freeCourseSlug}`)
    )
    await expect(page.getByRole("heading", { name: qaFixtures.freeCourseTitle })).toBeVisible()

    await expect
      .poll(async () =>
        getEnrollment(qaCredentials.userEmail, freeCourse!.id).then((row) => row?.source ?? null)
      )
      .toBe("free")

    await page.goto("/dashboard")
    await expect(page.getByText(qaFixtures.freeCourseTitle)).toBeVisible()
  })

  test("permite acceso al curso comprado y actualiza progreso verificable", async ({
    page,
  }) => {
    const paidCourse = await getCourseBySlug(qaFixtures.paidPrimaryCourseSlug)
    await loginAsUser(page)
    await page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)

    await expect(
      page.getByRole("heading", { name: qaFixtures.paidPrimaryCourseTitle })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /marcar como completada/i })
    ).toBeVisible()

    await page.getByRole("button", { name: /marcar como completada/i }).click()
    await expect(
      page.getByRole("button", { name: /completada/i })
    ).toBeVisible()

    await expect
      .poll(async () => {
        const lessonProgress = await getLessonProgress(
          qaCredentials.userEmail,
          (await getCourseProgress(qaCredentials.userEmail, paidCourse!.id))?.last_lesson_id ??
            ""
        )
        return lessonProgress?.completed ?? false
      })
      .toBe(true)

    await expect
      .poll(async () => {
        const progress = await getCourseProgress(
          qaCredentials.userEmail,
          paidCourse!.id
        )
        return progress?.completed_lessons ?? 0
      })
      .toBe(1)

    await page.getByRole("button", { name: /completada/i }).click()
    await expect(
      page.getByRole("button", { name: /marcar como completada/i })
    ).toBeVisible()

    await expect
      .poll(async () => {
        const progress = await getCourseProgress(
          qaCredentials.userEmail,
          paidCourse!.id
        )
        return progress?.completed_lessons ?? 0
      })
      .toBe(0)

    await page.goto(`/dashboard/cursos/${qaFixtures.cartCourseOneSlug}`)
    await expect(page).toHaveURL(new RegExp(`/cursos/${qaFixtures.cartCourseOneSlug}`))
  })

  test("crea y actualiza resena del curso comprado con contraste DB", async ({
    page,
  }) => {
    const paidCourse = await getCourseBySlug(qaFixtures.paidPrimaryCourseSlug)
    expect(paidCourse?.id).toBeTruthy()

    await loginAsUser(page)
    await page.goto(`/cursos/${qaFixtures.paidPrimaryCourseSlug}`)

    await page.getByRole("radio", { name: /5 estrellas/i }).click()
    await page.getByLabel(/comentario/i).fill(reviewTextInitial)
    await page.getByRole("button", { name: /publicar resena/i }).click()

    await expect(page.getByText(/tu resena fue publicada/i)).toBeVisible()
    await expect
      .poll(async () =>
        getReviewForCourse(qaCredentials.userEmail, paidCourse!.id).then((review) => review?.text ?? null)
      )
      .toBe(reviewTextInitial)

    await page.reload()
    await page.getByRole("radio", { name: /4 estrellas/i }).click()
    await page.getByLabel(/comentario/i).fill(reviewTextUpdated)
    await page.getByRole("button", { name: /guardar cambios/i }).click()

    await expect(page.getByText(/tu resena fue actualizada/i)).toBeVisible()
    await expect
      .poll(async () =>
        getReviewForCourse(qaCredentials.userEmail, paidCourse!.id).then(
          (review) => `${review?.rating ?? 0}|${review?.text ?? ""}`
        )
      )
      .toBe(`4|${reviewTextUpdated}`)
  })

  test("actualiza perfil y muestra historial de compras", async ({ page }) => {
    const updatedName = `QA Student Studio Z ${runId}`
    const updatedPhone = "3001234567"

    await loginAsUser(page)
    await page.goto("/dashboard/perfil")

    await page.getByLabel(/nombre completo/i).fill(updatedName)
    await page.getByLabel(/telefono/i).fill(updatedPhone)
    await page.locator("#emailNotifications").click()
    await page.getByRole("button", { name: /guardar cambios/i }).click()

    await expect(page.getByText(/perfil actualizado exitosamente/i)).toBeVisible()
    await expect
      .poll(async () => {
        const profile = await getProfileByEmail(qaCredentials.userEmail)
        return [
          profile?.profile.full_name ?? "",
          profile?.profile.phone ?? "",
          profile?.profile.email_notifications ? "on" : "off",
        ].join("|")
      })
      .toBe(`${updatedName}|${updatedPhone}|off`)

    await page.goto("/dashboard/compras")
    await expect(page.getByText(qaFixtures.orderReference)).toBeVisible()

    await page.getByRole("button", { name: new RegExp(qaFixtures.orderReference) }).click()
    await expect(page.getByText(qaFixtures.paidPrimaryCourseTitle)).toBeVisible()
    await expect(page.getByText(/tarjeta/i)).toBeVisible()
  })

  test("procesa contacto y persiste el mensaje en DB", async ({ page }) => {
    await page.goto("/contacto")
    await page.getByLabel(/nombre completo/i).fill("QA Contact Studio Z")
    await page.getByLabel(/^email$/i).fill(qaCredentials.userEmail)
    await page.getByLabel(/asunto/i).fill(contactSubject)
    await page.getByLabel(/mensaje/i).fill(
      "Mensaje E2E para validar persistencia del formulario de contacto."
    )
    await page.getByRole("button", { name: /enviar mensaje/i }).click()

    await expect(page.getByText(/recibimos tu mensaje/i)).toBeVisible()
    await expect
      .poll(async () => (await getContactMessagesBySubject(contactSubject)).length)
      .toBe(1)
  })

  test("admin ve dashboard, ficha de usuario y ventas con detalle verificable", async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto("/admin")

    await expect(
      page.getByRole("heading", { name: /panel de administracion/i })
    ).toBeVisible()
    await expect(page.getByText(qaFixtures.orderReference)).toBeVisible()

    await page.goto(
      `/admin/usuarios?search=${encodeURIComponent(qaCredentials.userEmail)}`
    )
    await expect(page.getByText(qaCredentials.userEmail)).toBeVisible()
    await page.getByRole("link", { name: /ver ficha/i }).click()

    await expect(page.getByText(qaCredentials.userEmail)).toBeVisible()
    await page.getByRole("tab", { name: /cursos/i }).click()
    await expect(page.getByText(qaFixtures.paidPrimaryCourseTitle)).toBeVisible()

    await page.getByRole("tab", { name: /ordenes/i }).click()
    await expect(page.getByText(qaFixtures.orderReference)).toBeVisible()

    await page.goto(
      `/admin/ventas?search=${encodeURIComponent(qaFixtures.orderReference)}`
    )
    const orderRow = page.getByRole("row", {
      name: new RegExp(qaFixtures.orderReference),
    })
    await expect(orderRow).toBeVisible()
    await expect(orderRow.getByText("Aprobada", { exact: true })).toBeVisible()
    await expect(orderRow.getByText("CARD", { exact: true })).toBeVisible()
  })

  test("admin abre detalle de orden y reenvia email de compra", async ({
    page,
  }) => {
    const order = await getOrderByReference(qaFixtures.orderReference)
    expect(order?.id).toBeTruthy()

    await loginAsAdmin(page)
    await page.goto(
      `/admin/ventas?search=${encodeURIComponent(qaFixtures.orderReference)}`
    )
    await page.getByRole("button", { name: /^ver$/i }).click()

    await expect(
      page.getByRole("heading", { name: new RegExp(`Orden ${qaFixtures.orderReference}`) })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /reenviar email de compra/i })
    ).toBeVisible()

    await page.getByRole("button", { name: /reenviar email de compra/i }).click()
    await expect(page.getByText(/encolado para reenvio/i)).toBeVisible()

    await expect
      .poll(async () => (await getOutboxEntry(order!.id))?.status ?? null)
      .toBe("pending")
  })

  test("admin crea, actualiza y elimina combos con auditoria", async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto("/admin/combos")

    const createForm = page.getByTestId("combo-create-form")
    await createForm.locator('input[name="name"]').fill(comboName)
    await createForm.locator('input[name="minCourses"]').fill("3")
    await createForm.locator('input[name="discountValue"]').fill("15")
    await createForm.getByRole("button", { name: /crear combo/i }).click()

    await expect
      .poll(async () => getDiscountRuleByName(comboName).then((rule) => !!rule))
      .toBe(true)

    const comboRecord = await getDiscountRuleByName(comboName)
    expect(comboRecord?.id).toBeTruthy()

    const comboCard = page.getByTestId(`combo-card-${comboRecord!.id}`)
    await comboCard.locator('input[name="name"]').fill(comboNameUpdated)
    await comboCard.locator('input[name="discountValue"]').fill("20")
    await comboCard.getByRole("button", { name: /guardar cambios/i }).click()

    await expect
      .poll(async () =>
        getDiscountRuleByName(comboNameUpdated).then((rule) =>
          rule ? `${rule.name}|${rule.discount_value}` : null
        )
      )
      .toBe(`${comboNameUpdated}|20`)

    await page.goto("/admin/auditoria?action=combo.update")
    await expect(page.getByRole("cell", { name: "combo.update" }).first()).toBeVisible()
    await expect
      .poll(async () => (await getAuditLogsByAction("combo.update")).length > 0)
      .toBeTruthy()

    await page.goto("/admin/combos")
    const updatedRule = await getDiscountRuleByName(comboNameUpdated)
    expect(updatedRule?.id).toBeTruthy()

    await page
      .getByTestId(`combo-card-${updatedRule!.id}`)
      .getByRole("button", { name: /eliminar combo/i })
      .click()

    await expect
      .poll(async () => getDiscountRuleByName(comboNameUpdated))
      .toBeNull()
  })

  test("admin crea, actualiza y elimina noticia con reflejo publico y auditoria", async ({
    page,
  }) => {
    const newsSlug = slugify(newsTitle)
    const newsSlugUpdated = slugify(newsTitleUpdated)

    await loginAsAdmin(page)
    await page.goto("/admin/noticias")

    const createForm = page.getByTestId("news-create-form")
    await createForm.locator('input[name="title"]').fill(newsTitle)
    await createForm.locator('input[name="excerpt"]').fill("Extracto temporal QA E2E.")
    await createForm.locator('textarea[name="content"]').fill(
      "Contenido temporal QA E2E para validar CRUD editorial."
    )
    await createForm.getByRole("checkbox").check()
    await createForm.getByRole("button", { name: /crear noticia/i }).click()

    await expect
      .poll(async () => getPostBySlug(newsSlug).then((post) => !!post))
      .toBe(true)

    const post = await getPostBySlug(newsSlug)
    expect(post?.id).toBeTruthy()

    const postCard = page.getByTestId(`news-card-${post!.id}`)
    await postCard.locator('input[name="title"]').fill(newsTitleUpdated)
    await postCard.locator('textarea[name="content"]').fill(
      "Contenido actualizado QA E2E para reflejo publico."
    )
    await postCard.getByRole("button", { name: /guardar cambios/i }).click()

    await expect
      .poll(async () => getPostBySlug(newsSlugUpdated).then((row) => row?.title ?? null))
      .toBe(newsTitleUpdated)

    await page.goto(`/noticias/${newsSlugUpdated}`)
    await expect(
      page.getByRole("heading", { level: 1, name: newsTitleUpdated })
    ).toBeVisible()

    await page.goto("/admin/auditoria?action=post.update")
    await expect(page.getByRole("cell", { name: "post.update" }).first()).toBeVisible()

    await page.goto("/admin/noticias")
    const updatedPost = await getPostBySlug(newsSlugUpdated)
    expect(updatedPost?.id).toBeTruthy()

    await page
      .getByTestId(`news-card-${updatedPost!.id}`)
      .getByRole("button", { name: /eliminar noticia/i })
      .click()

    await expect
      .poll(async () => getPostBySlug(newsSlugUpdated))
      .toBeNull()
  })

  test("admin modera visibilidad de resenas contra DB y sitio publico", async ({
    page,
  }) => {
    const paidCourse = await getCourseBySlug(qaFixtures.paidPrimaryCourseSlug)
    await ensureReviewForCourse({
      email: qaCredentials.userEmail,
      courseId: paidCourse!.id,
      rating: 4,
      text: reviewTextUpdated,
      isVisible: true,
    })
    const review = await getReviewForCourse(qaCredentials.userEmail, paidCourse!.id)
    expect(review?.id).toBeTruthy()

    await loginAsAdmin(page)
    await page.goto("/admin/resenas")

    const row = page.getByRole("row", { name: new RegExp(reviewTextUpdated) })
    await row.getByRole("switch").click()

    await expect
      .poll(async () =>
        getReviewForCourse(qaCredentials.userEmail, paidCourse!.id).then(
          (current) => current?.is_visible ?? true
        )
      )
      .toBe(false)

    await page.goto(`/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
    await expect(page.getByText(reviewTextUpdated)).not.toBeVisible()

    await page.goto("/admin/resenas")
    await page
      .getByRole("row", { name: new RegExp(reviewTextUpdated) })
      .getByRole("switch")
      .click()

    await expect
      .poll(async () =>
        getReviewForCourse(qaCredentials.userEmail, paidCourse!.id).then(
          (current) => current?.is_visible ?? false
        )
      )
      .toBe(true)
  })

  test("admin crea instructor y curso publico visible en catalogo", async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto("/admin/instructores")

    await page.getByLabel(/nombre completo/i).fill(instructorName)
    await page.getByLabel(/^bio$/i).fill("Instructor temporal QA E2E.")
    await page.getByLabel(/especialidades/i).fill("Workshop, Demo")
    await page.getByLabel(/anos de experiencia/i).fill("4")
    await page.getByRole("button", { name: /crear instructor/i }).click()

    const instructorSlug = slugify(instructorName)
    await expect
      .poll(async () =>
        getInstructorBySlug(instructorSlug).then((instructor) => !!instructor)
      )
      .toBe(true)

    await page.goto("/admin/cursos/nuevo")
    await page.getByLabel(/titulo/i).fill(courseTitle)
    await page.getByLabel(/descripcion corta/i).fill("Curso creado por suite E2E.")
    await page.getByLabel(/descripcion completa/i).fill(
      "Descripcion de curso creado por admin para validar CRUD publico."
    )
    await page.locator("#category").click()
    await page.getByRole("option", { name: /^tatuaje$/i }).click()
    await page.locator("#instructorId").click()
    await page.getByRole("option", { name: instructorName }).click()
    await page.locator("#isFree").click()
    await page.getByRole("button", { name: /crear curso/i }).click()

    await expect(page).toHaveURL(/\/admin\/cursos\/.+\/editar/)
    await page.locator("#isPublished").click()
    await page.getByRole("button", { name: /guardar cambios/i }).click()
    await expect(page.getByText(/curso actualizado exitosamente/i)).toBeVisible()

    await expect
      .poll(async () => getCourseBySlug(slugify(courseTitle)).then((course) => !!course))
      .toBe(true)

    await expect
      .poll(async () => getCourseBySlug(slugify(courseTitle)).then((course) => course?.is_published ?? false))
      .toBe(true)

    await page.goto(`/cursos?search=${encodeURIComponent(courseTitle)}`)
    await expect(page.getByText(courseTitle)).toBeVisible()
  })
})
