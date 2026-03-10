import { expect, test } from "@playwright/test"

import { resolveCartStateForUser } from "../src/lib/cart"
import { formatCOP } from "../src/lib/utils"
import { loginAsUser } from "./support/auth"
import {
  cleanupCourseTree,
  cleanupCoursesBySlugPrefix,
  clearUserCart,
  e2eSupabase,
  ensureBusinessFixtures,
  getCourseBySlug,
  getEnrollment,
  getInstructorBySlug,
  getLatestOrderForEmail,
  getOutboxEntry,
  getProfileByEmail,
  qaCredentials,
  qaFixtures,
  slugify,
} from "./support/db"

const runId = Date.now().toString(36)

async function cleanupOrder(orderId: string | null) {
  if (!orderId) return

  await e2eSupabase.from("order_email_outbox").delete().eq("order_id", orderId)
  await e2eSupabase.from("payment_events").delete().eq("order_id", orderId)
  await e2eSupabase.from("order_discount_lines").delete().eq("order_id", orderId)
  await e2eSupabase.from("order_items").delete().eq("order_id", orderId)
  await e2eSupabase.from("orders").delete().eq("id", orderId)
}

async function cleanupPurchaseState(userId: string, courseIds: string[]) {
  const { data: lessons } = await e2eSupabase
    .from("lessons")
    .select("id")
    .in("course_id", courseIds)

  const lessonIds = (lessons ?? []).map((lesson) => lesson.id)
  if (lessonIds.length > 0) {
    await e2eSupabase
      .from("lesson_progress")
      .delete()
      .eq("user_id", userId)
      .in("lesson_id", lessonIds)
  }

  await e2eSupabase.from("course_progress").delete().eq("user_id", userId).in("course_id", courseIds)
  await e2eSupabase.from("enrollments").delete().eq("user_id", userId).in("course_id", courseIds)
  await e2eSupabase.from("cart_items").delete().eq("user_id", userId).in("course_id", courseIds)
}

async function cleanupPromotionFixtures() {
  await e2eSupabase
    .from("discount_rules")
    .update({ is_active: false })
    .ilike("name", "QA E2E Buy2Get1 %")
  await e2eSupabase
    .from("discount_rules")
    .update({ is_active: false })
    .ilike("name", "QA E2E Combo 100 %")
  await e2eSupabase.from("discount_rules").delete().ilike("name", "QA E2E Buy2Get1 %")
  await e2eSupabase.from("discount_rules").delete().ilike("name", "QA E2E Combo 100 %")
  await cleanupCoursesBySlugPrefix("qa-e2e-promo-temp-")
}

test.describe.serial("promotions pricing", () => {
  test.skip(
    ({ isMobile }) => isMobile,
    "La suite promocional muta datos compartidos y corre una sola vez en desktop."
  )

  test.beforeAll(async () => {
    await ensureBusinessFixtures()
  })

  test.beforeEach(async () => {
    await cleanupPromotionFixtures()
  })

  test("muestra 100% OFF y entrega acceso interno sin Wompi", async ({ page }) => {
    const course = await getCourseBySlug(qaFixtures.cartCourseOneSlug)
    const profile = await getProfileByEmail(qaCredentials.userEmail)

    expect(course?.id).toBeTruthy()
    expect(profile?.authUser.id).toBeTruthy()

    let latestPromoOrderId: string | null = null

    try {
      await clearUserCart(qaCredentials.userEmail)
      await cleanupPurchaseState(profile!.authUser.id, [course!.id])

      await e2eSupabase
        .from("courses")
        .update({
          is_free: false,
          course_discount_enabled: true,
          course_discount_type: "percentage",
          course_discount_value: 100,
        })
        .eq("id", course!.id)

      await page.goto("/cursos")
      await expect(page.getByText("100% OFF").first()).toBeVisible()
      await expect(page.getByText("Gratis por promo").first()).toBeVisible()

      await loginAsUser(page)
      await page.goto(`/cursos/${qaFixtures.cartCourseOneSlug}`)
      await expect(page.getByText("100% OFF").first()).toBeVisible()
      await expect(page.getByRole("button", { name: /inscribirme gratis/i })).toBeVisible()

      await page.getByRole("button", { name: /inscribirme gratis/i }).click()
      await expect(page).toHaveURL(new RegExp(`/dashboard/cursos/${qaFixtures.cartCourseOneSlug}$`))

      await expect
        .poll(async () => getEnrollment(qaCredentials.userEmail, course!.id).then((row) => row?.source ?? null))
        .toBe("purchase")

      await expect
        .poll(async () => {
          const order = await getLatestOrderForEmail(qaCredentials.userEmail)
          if (order?.payment_method !== "promo") return null
          return JSON.stringify({
            id: order.id,
            total: order.total,
            method: order.payment_method,
            lineCount: Array.isArray(order.discount_lines) ? order.discount_lines.length : 0,
          })
        })
        .toBeTruthy()

      const order = await getLatestOrderForEmail(qaCredentials.userEmail)
      latestPromoOrderId = order?.payment_method === "promo" ? order.id : null

      expect(order?.total).toBe(0)
      expect(order?.payment_method).toBe("promo")
      expect(Array.isArray(order?.discount_lines) ? order!.discount_lines.length : 0).toBeGreaterThan(0)

      await expect
        .poll(async () => {
          if (!latestPromoOrderId) return null
          return (await getOutboxEntry(latestPromoOrderId))?.status ?? null
        })
        .toBe("pending")
    } finally {
      await e2eSupabase
        .from("courses")
        .update({
          course_discount_enabled: false,
          course_discount_type: null,
          course_discount_value: null,
        })
        .eq("id", course?.id ?? "")
      await cleanupOrder(latestPromoOrderId)
      await cleanupPurchaseState(profile?.authUser.id ?? "", course?.id ? [course.id] : [])
      await clearUserCart(qaCredentials.userEmail)
    }
  })

  test("aplica buy x get y en carrito y deja el ultimo curso gratis", async ({ page }) => {
    const profile = await getProfileByEmail(qaCredentials.userEmail)
    const instructor = await getInstructorBySlug(qaFixtures.danceInstructorSlug)
    const comboName = `QA E2E Buy2Get1 ${runId}`
    const tempCourseTitle = `QA E2E Promo Temp ${runId}`
    const tempCourseSlug = slugify(tempCourseTitle)

    expect(profile?.authUser.id).toBeTruthy()
    expect(instructor?.id).toBeTruthy()

    let tempCourseId: string | null = null
    let comboRuleId: string | null = null

    try {
      await clearUserCart(qaCredentials.userEmail)

      const { data: tempCourse, error: tempCourseError } = await e2eSupabase
        .from("courses")
        .insert({
          title: tempCourseTitle,
          slug: tempCourseSlug,
          description: "Curso temporal para probar combo buy x get y.",
          short_description: "Temporal promo QA.",
          category: "baile",
          price: 7000000,
          is_free: false,
          thumbnail_url: null,
          preview_video_url: null,
          instructor_id: instructor!.id,
          legacy_instructor_name: null,
          is_published: true,
          published_at: new Date().toISOString(),
        })
        .select("id")
        .single()

      if (tempCourseError || !tempCourse?.id) {
        throw tempCourseError ?? new Error("No se pudo crear el curso temporal de promo.")
      }

      tempCourseId = tempCourse.id

      const { data: comboRule, error: comboRuleError } = await e2eSupabase
        .from("discount_rules")
        .insert({
          name: comboName,
          category: "baile",
          combo_kind: "buy_x_get_y",
          min_courses: 3,
          discount_type: null,
          discount_value: null,
          buy_quantity: 2,
          free_quantity: 1,
          is_active: true,
        })
        .select("id")
        .single()

      if (comboRuleError || !comboRule?.id) {
        throw comboRuleError ?? new Error("No se pudo crear el combo temporal.")
      }

      comboRuleId = comboRule.id

      await loginAsUser(page)

      for (const slug of [
        qaFixtures.cartCourseOneSlug,
        qaFixtures.cartCourseTwoSlug,
        tempCourseSlug,
      ]) {
        await page.goto(`/cursos/${slug}`)
        await page.getByRole("button", { name: /agregar al carrito/i }).click()
      }

      await page.goto("/carrito")
      await expect(page.getByText("Gratis por promo")).toHaveCount(1)

      const pricing = await resolveCartStateForUser({
        supabase: e2eSupabase,
        userId: profile!.authUser.id,
      })

      const freeItem = pricing.items.find((item) => item.course.slug === tempCourseSlug)
      expect(freeItem?.finalPrice).toBe(0)
      expect(freeItem?.comboPromotionLabel).toContain(comboName)
      expect(pricing.comboDiscountAmount).toBe(7000000)
    } finally {
      await clearUserCart(qaCredentials.userEmail)
      if (comboRuleId) {
        await e2eSupabase.from("discount_rules").delete().eq("id", comboRuleId)
      }
      if (tempCourseId) {
        await cleanupCourseTree(tempCourseId)
      }
    }
  })

  test("si el total del carrito queda en 0, finaliza interno y no muestra Wompi", async ({ page }) => {
    const profile = await getProfileByEmail(qaCredentials.userEmail)
    const comboName = `QA E2E Combo 100 ${runId}`
    const courseIds: string[] = []
    let comboRuleId: string | null = null
    let zeroTotalOrderId: string | null = null

    expect(profile?.authUser.id).toBeTruthy()

    try {
      await clearUserCart(qaCredentials.userEmail)

      for (const slug of [qaFixtures.cartCourseOneSlug, qaFixtures.cartCourseTwoSlug]) {
        const course = await getCourseBySlug(slug)
        if (course?.id) courseIds.push(course.id)
      }

      await cleanupPurchaseState(profile!.authUser.id, courseIds)

      const { data: comboRule, error: comboRuleError } = await e2eSupabase
        .from("discount_rules")
        .insert({
          name: comboName,
          category: "baile",
          combo_kind: "threshold_discount",
          min_courses: 2,
          discount_type: "percentage",
          discount_value: 100,
          buy_quantity: null,
          free_quantity: null,
          is_active: true,
        })
        .select("id")
        .single()

      if (comboRuleError || !comboRule?.id) {
        throw comboRuleError ?? new Error("No se pudo crear el combo 100%.")
      }

      comboRuleId = comboRule.id

      await loginAsUser(page)
      for (const slug of [qaFixtures.cartCourseOneSlug, qaFixtures.cartCourseTwoSlug]) {
        await page.goto(`/cursos/${slug}`)
        await page.getByRole("button", { name: /agregar al carrito/i }).click()
      }

      await page.goto("/carrito")
      await expect(page.getByRole("button", { name: /finalizar inscripcion/i })).toBeVisible()
      await expect(page.getByText(/no requiere pago externo/i)).toBeVisible()
      await expect(page.getByText(`Combos (${comboName})`)).toBeVisible()
      await expect(page.getByText(formatCOP(0)).last()).toBeVisible()

      await page.getByRole("button", { name: /finalizar inscripcion/i }).click()
      await expect(page).toHaveURL(/\/dashboard\/compras$/)

      await expect
        .poll(async () => {
          const order = await getLatestOrderForEmail(qaCredentials.userEmail)
          if (order?.payment_method !== "promo") return null
          return JSON.stringify({
            id: order.id,
            total: order.total,
            method: order.payment_method,
            items: Array.isArray(order.items) ? order.items.length : 0,
          })
        })
        .toBeTruthy()

      const order = await getLatestOrderForEmail(qaCredentials.userEmail)
      zeroTotalOrderId = order?.payment_method === "promo" ? order.id : null

      expect(order?.total).toBe(0)
      expect(order?.payment_method).toBe("promo")
      expect(Array.isArray(order?.items) ? order!.items.length : 0).toBe(2)
      expect(Array.isArray(order?.discount_lines) ? order!.discount_lines.length : 0).toBeGreaterThan(0)

      await expect
        .poll(async () =>
          Promise.all(courseIds.map((courseId) => getEnrollment(qaCredentials.userEmail, courseId)))
            .then((rows) => rows.every(Boolean))
        )
        .toBe(true)
    } finally {
      if (comboRuleId) {
        await e2eSupabase.from("discount_rules").delete().eq("id", comboRuleId)
      }
      await cleanupOrder(zeroTotalOrderId)
      if (profile?.authUser.id && courseIds.length > 0) {
        await cleanupPurchaseState(profile.authUser.id, courseIds)
      }
      await clearUserCart(qaCredentials.userEmail)
    }
  })
})
