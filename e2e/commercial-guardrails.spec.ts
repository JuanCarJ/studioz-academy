import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test"

import { resolveCartStateForUser } from "../src/lib/cart"
import { isMissingDiscountRuleNameSnapshotColumn } from "../src/lib/discount-rule-snapshot"
import { formatCOP } from "../src/lib/utils"
import { loginAsAdmin, loginAsUser } from "./support/auth"
import {
  clearUserCart,
  e2eSupabase,
  ensureBusinessFixtures,
  getCartItemsForEmail,
  getCourseBySlug,
  getDiscountRuleByName,
  getLessonByTitle,
  getOrderByReference,
  getProfileByEmail,
  qaCredentials,
  qaFixtures,
} from "./support/db"

const runId = Date.now().toString(36)

async function createSession(
  browser: Browser,
  role: "admin" | "user" | "guest"
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext()
  const page = await context.newPage()

  if (role === "admin") {
    await loginAsAdmin(page)
  } else if (role === "user") {
    await loginAsUser(page)
  }

  return { context, page }
}

async function closeSessions(
  ...sessions: Array<{ context: BrowserContext } | null | undefined>
) {
  await Promise.all(
    sessions
      .filter((session): session is { context: BrowserContext } => Boolean(session))
      .map((session) => session.context.close())
  )
}

async function setSwitchState(locator: Locator, checked: boolean) {
  const current = (await locator.getAttribute("aria-checked")) === "true"
  if (current !== checked) {
    await locator.click()
  }
  await expect(locator).toHaveAttribute("aria-checked", checked ? "true" : "false")
}

async function updateCourseFromAdmin(input: {
  page: Page
  courseId: string
  isFree: boolean
  pricePesos?: number
}) {
  await input.page.goto(`/admin/cursos/${input.courseId}/editar`)

  await setSwitchState(
    input.page.getByRole("switch", { name: /curso gratuito/i }),
    input.isFree
  )

  if (!input.isFree && typeof input.pricePesos === "number") {
    const priceInput = input.page.getByLabel(/^precio/i)
    await priceInput.fill(String(input.pricePesos))
  }

  await input.page.getByRole("button", { name: /guardar cambios/i }).click()
  await expect(
    input.page.getByText(/curso actualizado exitosamente/i)
  ).toBeVisible()
}

async function updateLessonFreeFlag(input: {
  page: Page
  courseId: string
  lessonId: string
  isFree: boolean
}) {
  await input.page.goto(`/admin/cursos/${input.courseId}/editar`)

  const row = input.page.getByTestId(`lesson-row-${input.lessonId}`)
  await row.getByRole("button", { name: /editar/i }).click()

  const dialog = input.page.getByRole("dialog", { name: /editar leccion/i })
  await setSwitchState(
    dialog.getByRole("switch", { name: /leccion gratuita/i }),
    input.isFree
  )

  await dialog.getByRole("button", { name: /guardar cambios/i }).click()
  await expect(dialog).toBeHidden()
  await expect(row.getByText(/^gratis$/i)).toHaveCount(input.isFree ? 1 : 0)
}

async function deleteOrderByReference(reference: string) {
  const order = await getOrderByReference(reference)
  if (!order?.id) return

  await e2eSupabase.from("order_email_outbox").delete().eq("order_id", order.id)
  await e2eSupabase.from("payment_events").delete().eq("order_id", order.id)
  await e2eSupabase.from("order_items").delete().eq("order_id", order.id)
  await e2eSupabase.from("orders").delete().eq("id", order.id)
}

async function supportsDiscountRuleNameSnapshotColumn() {
  const probe = await e2eSupabase
    .from("orders")
    .select("id, discount_rule_name_snapshot")
    .limit(1)

  if (!probe.error) return true
  if (isMissingDiscountRuleNameSnapshotColumn(probe.error)) return false
  throw probe.error
}

test.describe.serial("commercial guardrails", () => {
  test.skip(
    ({ isMobile }) => isMobile,
    "La suite comercial muta datos compartidos y corre una sola vez en desktop."
  )

  test.beforeAll(async () => {
    await ensureBusinessFixtures()
  })

  test("admin no puede crear combos invalidos debajo del minimo permitido", async ({
    page,
  }) => {
    const invalidComboName = `QA Invalid Combo ${runId}`

    await loginAsAdmin(page)
    await page.goto("/admin/combos")

    const createForm = page.getByTestId("combo-create-form")
    const minCoursesInput = createForm.locator('input[name="minCourses"]')

    await createForm.locator('input[name="name"]').fill(invalidComboName)
    await minCoursesInput.fill("1")
    await createForm.locator('input[name="discountValue"]').fill("10")
    await createForm.getByRole("button", { name: /crear combo/i }).click()

    const validationMessage = await minCoursesInput.evaluate((node) =>
      (node as HTMLInputElement).validationMessage
    )

    expect(validationMessage).not.toBe("")
    await expect
      .poll(async () => getDiscountRuleByName(invalidComboName).then(Boolean))
      .toBe(false)
  })

  test("login con addToCart hacia un curso gratis vuelve al curso y no fuerza carrito", async ({
    page,
  }) => {
    const freeCourse = await getCourseBySlug(qaFixtures.freeCourseSlug)

    expect(freeCourse?.id).toBeTruthy()
    await clearUserCart(qaCredentials.userEmail)

    await page.goto(
      `/login?redirect=${encodeURIComponent(`/cursos/${qaFixtures.freeCourseSlug}`)}&addToCart=${freeCourse!.id}`
    )
    await page.getByLabel(/^email$/i).fill(qaCredentials.userEmail)
    await page.getByLabel(/contrasena/i).fill(qaCredentials.userPassword)
    await page.getByRole("button", { name: /iniciar sesion$/i }).click()

    await expect(page).toHaveURL(new RegExp(`/cursos/${qaFixtures.freeCourseSlug}$`))
    await expect(
      page.getByRole("button", { name: /inscribirme gratis/i })
    ).toBeVisible()
    await expect
      .poll(async () => (await getCartItemsForEmail(qaCredentials.userEmail)).length)
      .toBe(0)
  })

  test("si un curso cambia a gratis desde admin, el carrito lo purga y ofrece inscripcion gratis", async ({
    browser,
  }) => {
    const course = await getCourseBySlug(qaFixtures.cartCourseOneSlug)

    expect(course?.id).toBeTruthy()
    await clearUserCart(qaCredentials.userEmail)

    let userSession: { context: BrowserContext; page: Page } | null = null
    let adminSession: { context: BrowserContext; page: Page } | null = null

    try {
      userSession = await createSession(browser, "user")
      adminSession = await createSession(browser, "admin")

      await userSession.page.goto(`/cursos/${qaFixtures.cartCourseOneSlug}`)
      await userSession.page.getByRole("button", { name: /agregar al carrito/i }).click()
      await userSession.page.goto("/carrito")
      await expect(
        userSession.page.getByText(qaFixtures.cartCourseOneTitle)
      ).toBeVisible()

      await updateCourseFromAdmin({
        page: adminSession.page,
        courseId: course!.id,
        isFree: true,
      })

      await userSession.page.goto("/carrito")
      await expect(
        userSession.page.getByRole("heading", { name: /tu carrito esta vacio/i })
      ).toBeVisible()

      await userSession.page.goto(`/cursos/${qaFixtures.cartCourseOneSlug}`)
      await expect(
        userSession.page.getByRole("button", { name: /inscribirme gratis/i })
      ).toBeVisible()
      await expect
        .poll(async () => (await getCartItemsForEmail(qaCredentials.userEmail)).length)
        .toBe(0)
    } finally {
      await e2eSupabase
        .from("courses")
        .update({ is_free: false, price: 9000000 })
        .eq("id", course?.id ?? "")
      await clearUserCart(qaCredentials.userEmail)
      await closeSessions(userSession, adminSession)
    }
  })

  test("si el admin cambia el precio, carrito y checkout usan el mismo monto", async ({
    browser,
  }) => {
    const course = await getCourseBySlug(qaFixtures.cartCourseTwoSlug)
    const profile = await getProfileByEmail(qaCredentials.userEmail)
    const userId = profile?.authUser.id
    const updatedPriceInCents = 9500000
    const updatedPriceInPesos = updatedPriceInCents / 100

    expect(course?.id).toBeTruthy()
    expect(userId).toBeTruthy()
    await clearUserCart(qaCredentials.userEmail)

    let userSession: { context: BrowserContext; page: Page } | null = null
    let adminSession: { context: BrowserContext; page: Page } | null = null

    try {
      userSession = await createSession(browser, "user")
      adminSession = await createSession(browser, "admin")

      await userSession.page.goto(`/cursos/${qaFixtures.cartCourseTwoSlug}`)
      await userSession.page.getByRole("button", { name: /agregar al carrito/i }).click()

      await updateCourseFromAdmin({
        page: adminSession.page,
        courseId: course!.id,
        isFree: false,
        pricePesos: updatedPriceInPesos,
      })

      await userSession.page.goto("/carrito")
      await expect(
        userSession.page.getByText(formatCOP(updatedPriceInCents)).first()
      ).toBeVisible()

      const pricingState = await resolveCartStateForUser({
        supabase: e2eSupabase,
        userId: userId!,
      })

      expect(pricingState.items).toHaveLength(1)
      expect(pricingState.items[0]?.course.price).toBe(updatedPriceInCents)
      expect(pricingState.subtotal).toBe(updatedPriceInCents)
      expect(pricingState.discountAmount).toBe(0)
      expect(pricingState.total).toBe(updatedPriceInCents)
    } finally {
      await e2eSupabase
        .from("courses")
        .update({ is_free: false, price: 8000000 })
        .eq("id", course?.id ?? "")
      await clearUserCart(qaCredentials.userEmail)
      await closeSessions(userSession, adminSession)
    }
  })

  test("renombrar o borrar combos no rompe el historial ni el filtro con combo", async ({
    page,
  }) => {
    const hasSnapshotColumn = await supportsDiscountRuleNameSnapshotColumn()
    const profile = await getProfileByEmail(qaCredentials.userEmail)
    const userId = profile?.authUser.id
    const snapshotComboName = `QA Snapshot Combo ${runId}`
    const renamedSnapshotComboName = `${snapshotComboName} Renombrado`
    const legacyComboName = `QA Legacy Combo ${runId}`
    const snapshotReference = `QA-SNAPSHOT-${runId.toUpperCase()}`
    const legacyReference = `QA-LEGACY-${runId.toUpperCase()}`
    let snapshotRuleId: string | null = null
    let legacyRuleId: string | null = null

    expect(userId).toBeTruthy()

    try {
      if (hasSnapshotColumn) {
        const { data: snapshotRule, error: snapshotRuleError } = await e2eSupabase
          .from("discount_rules")
          .insert({
            name: snapshotComboName,
            category: "baile",
            combo_kind: "threshold_discount",
            min_courses: 2,
            discount_type: "percentage",
            discount_value: 10,
            buy_quantity: null,
            free_quantity: null,
            is_active: true,
          })
          .select("id")
          .single()

        if (snapshotRuleError || !snapshotRule?.id) {
          throw snapshotRuleError ?? new Error("No se pudo crear el combo snapshot")
        }

        snapshotRuleId = snapshotRule.id
      }

      const { data: legacyRule, error: legacyRuleError } = await e2eSupabase
        .from("discount_rules")
        .insert({
          name: legacyComboName,
          category: "baile",
          combo_kind: "threshold_discount",
          min_courses: 2,
          discount_type: "percentage",
          discount_value: 10,
          buy_quantity: null,
          free_quantity: null,
          is_active: true,
        })
        .select("id")
        .single()

      if (legacyRuleError || !legacyRule?.id) {
        throw legacyRuleError ?? new Error("No se pudo crear el combo legacy")
      }

      legacyRuleId = legacyRule.id

      if (hasSnapshotColumn && snapshotRuleId) {
        const { error: snapshotOrderError } = await e2eSupabase.from("orders").insert({
          user_id: userId,
          reference: snapshotReference,
          customer_name_snapshot: profile?.profile.full_name ?? "QA Student Studio Z",
          customer_email_snapshot: qaCredentials.userEmail,
          customer_phone_snapshot: profile?.profile.phone ?? null,
          list_subtotal: 17000000,
          subtotal: 17000000,
          course_discount_amount: 0,
          combo_discount_amount: 1700000,
          discount_amount: 1700000,
          discount_rule_id: snapshotRuleId,
          discount_rule_name_snapshot: snapshotComboName,
          pricing_snapshot_json: null,
          total: 15300000,
          currency: "COP",
          status: "approved",
          payment_method: "CARD",
          approved_at: new Date().toISOString(),
        })

        if (snapshotOrderError) {
          throw snapshotOrderError
        }
      }

      const legacyOrderPayload = {
        user_id: userId,
        reference: legacyReference,
        customer_name_snapshot: profile?.profile.full_name ?? "QA Student Studio Z",
        customer_email_snapshot: qaCredentials.userEmail,
        customer_phone_snapshot: profile?.profile.phone ?? null,
        list_subtotal: 17000000,
        subtotal: 17000000,
        course_discount_amount: 0,
        combo_discount_amount: 1700000,
        discount_amount: 1700000,
        discount_rule_id: null,
        pricing_snapshot_json: null,
        total: 15300000,
        currency: "COP",
        status: "approved",
        payment_method: "CARD",
        approved_at: new Date().toISOString(),
      }
      const { error: legacyOrderError } = await e2eSupabase.from("orders").insert(
        hasSnapshotColumn
          ? { ...legacyOrderPayload, discount_rule_name_snapshot: null }
          : legacyOrderPayload
      )

      if (legacyOrderError) {
        throw legacyOrderError
      }

      await loginAsAdmin(page)
      await page.goto("/admin/combos")

      if (hasSnapshotColumn && snapshotRuleId) {
        const snapshotCard = page.getByTestId(`combo-card-${snapshotRuleId}`)
        await snapshotCard.locator('input[name="name"]').fill(renamedSnapshotComboName)
        await snapshotCard.getByRole("button", { name: /guardar cambios/i }).click()
        await expect(snapshotCard.getByText(renamedSnapshotComboName)).toBeVisible()

        await page.goto(`/admin/ventas?search=${snapshotReference}`)
        await expect(page.getByText(snapshotReference)).toBeVisible()
        await expect(page.getByText(snapshotComboName)).toBeVisible()

        await page.goto("/admin/combos")
      }

      const legacyCard = page.getByTestId(`combo-card-${legacyRule.id}`)
      await legacyCard.getByRole("button", { name: /eliminar combo/i }).click()
      await expect(legacyCard).toHaveCount(0)

      await page.goto(`/admin/ventas?search=${legacyReference}&combo=with`)
      await expect(page.getByText(legacyReference)).toBeVisible()
      await expect(page.getByText(/descuento historico/i)).toBeVisible()
    } finally {
      await deleteOrderByReference(snapshotReference)
      await deleteOrderByReference(legacyReference)
      if (snapshotRuleId) {
        await e2eSupabase.from("discount_rules").delete().eq("id", snapshotRuleId)
      }
      if (legacyRuleId) {
        await e2eSupabase.from("discount_rules").delete().eq("id", legacyRuleId)
      }
    }
  })

  test("cambiar lecciones entre gratis y paga actualiza preview publica sin quitar acceso al alumno", async ({
    browser,
  }) => {
    test.slow()

    const course = await getCourseBySlug(qaFixtures.paidPrimaryCourseSlug)
    const freeLesson = await getLessonByTitle(course?.id ?? "", "QA E2E Preview Salsa")
    const paidLesson = await getLessonByTitle(course?.id ?? "", "QA E2E Salsa Principal")

    expect(course?.id).toBeTruthy()
    expect(freeLesson?.id).toBeTruthy()
    expect(paidLesson?.id).toBeTruthy()

    let adminSession: { context: BrowserContext; page: Page } | null = null
    let userSession: { context: BrowserContext; page: Page } | null = null
    let guestSession: { context: BrowserContext; page: Page } | null = null

    try {
      adminSession = await createSession(browser, "admin")
      userSession = await createSession(browser, "user")
      guestSession = await createSession(browser, "guest")

      await updateLessonFreeFlag({
        page: adminSession.page,
        courseId: course!.id,
        lessonId: freeLesson!.id,
        isFree: false,
      })

      await guestSession.page.goto(`/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
      await expect(
        guestSession.page.getByRole("button", { name: new RegExp(freeLesson!.title, "i") })
      ).toHaveCount(0)

      await userSession.page.goto(`/dashboard/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
      await expect(
        userSession.page.getByRole("button", { name: new RegExp(freeLesson!.title, "i") })
      ).toBeVisible()

      await updateLessonFreeFlag({
        page: adminSession.page,
        courseId: course!.id,
        lessonId: paidLesson!.id,
        isFree: true,
      })

      await guestSession.page.goto(`/cursos/${qaFixtures.paidPrimaryCourseSlug}`)
      await expect(
        guestSession.page.getByRole("button", { name: new RegExp(paidLesson!.title, "i") })
      ).toBeVisible()
    } finally {
      await e2eSupabase
        .from("lessons")
        .update({ is_free: true })
        .eq("id", freeLesson?.id ?? "")
      await e2eSupabase
        .from("lessons")
        .update({ is_free: false })
        .eq("id", paidLesson?.id ?? "")
      await closeSessions(adminSession, userSession, guestSession)
    }
  })
})
