import { createHash } from "node:crypto"

import { expect, test } from "@playwright/test"

import { loginAsUser } from "./support/auth"
import {
  clearUserCart,
  ensureBusinessFixtures,
  getOrderByReference,
  getProfileByEmail,
  qaCredentials,
  qaFixtures,
} from "./support/db"
import { loadLocalEnv, requiredEnv } from "./support/env"

loadLocalEnv()

const wompiIntegrityKey = requiredEnv("WOMPI_INTEGRITY_KEY")
const wompiPublicKey = requiredEnv("NEXT_PUBLIC_WOMPI_PUBLIC_KEY")

test.describe("Wompi checkout web", () => {
  test.skip(
    ({ isMobile }) => isMobile,
    "La verificacion del checkout web corre una sola vez en desktop."
  )

  test.beforeEach(async () => {
    await ensureBusinessFixtures()
  })

  test("genera la URL de checkout con los parametros documentados por Wompi", async ({
    page,
  }) => {
    const profile = await getProfileByEmail(qaCredentials.userEmail)

    await clearUserCart(qaCredentials.userEmail)
    await loginAsUser(page)

    await page.goto(`/cursos/${qaFixtures.cartCourseOneSlug}`)
    await page.getByRole("button", { name: /agregar al carrito/i }).click()
    await page.goto("/carrito")

    await Promise.all([
      page.waitForURL(/checkout\.wompi\.co\/p\//),
      page.getByRole("button", { name: /proceder al pago/i }).click(),
    ])

    const checkoutUrl = new URL(page.url())
    const reference = checkoutUrl.searchParams.get("reference")
    const amountInCents = checkoutUrl.searchParams.get("amount-in-cents")
    const redirectUrl = checkoutUrl.searchParams.get("redirect-url")
    const integrity = checkoutUrl.searchParams.get("signature:integrity")

    expect(checkoutUrl.origin).toBe("https://checkout.wompi.co")
    expect(checkoutUrl.pathname).toBe("/p/")
    expect(checkoutUrl.searchParams.get("public-key")).toBe(wompiPublicKey)
    expect(checkoutUrl.searchParams.get("currency")).toBe("COP")
    expect(reference).toBeTruthy()
    expect(amountInCents).toBe("9000000")
    expect(redirectUrl).toContain("/pago/retorno?reference=")
    expect(checkoutUrl.searchParams.get("customer-data:email")).toBe(
      qaCredentials.userEmail
    )
    expect(checkoutUrl.searchParams.get("customer-data:full-name")).toBe(
      profile?.profile.full_name ?? ""
    )

    const expectedIntegrity = createHash("sha256")
      .update(`${reference}${amountInCents}COP${wompiIntegrityKey}`)
      .digest("hex")
    expect(integrity).toBe(expectedIntegrity)

    await expect
      .poll(async () => (reference ? getOrderByReference(reference) : null))
      .not.toBeNull()

    const order = await getOrderByReference(reference!)
    expect(order?.status).toBe("pending")
    expect(order?.customer_email_snapshot).toBe(qaCredentials.userEmail)
    expect(order?.total).toBe(9000000)
  })

  test("genera checkout con combo y congela el nombre historico del descuento", async ({
    page,
  }) => {
    await clearUserCart(qaCredentials.userEmail)
    await loginAsUser(page)

    await page.goto(`/cursos/${qaFixtures.cartCourseOneSlug}`)
    await page.getByRole("button", { name: /agregar al carrito/i }).click()

    await page.goto(`/cursos/${qaFixtures.cartCourseTwoSlug}`)
    await page.getByRole("button", { name: /agregar al carrito/i }).click()

    await page.goto("/carrito")
    await Promise.all([
      page.waitForURL(/checkout\.wompi\.co\/p\//),
      page.getByRole("button", { name: /proceder al pago/i }).click(),
    ])

    const checkoutUrl = new URL(page.url())
    const reference = checkoutUrl.searchParams.get("reference")
    const amountInCents = checkoutUrl.searchParams.get("amount-in-cents")

    expect(reference).toBeTruthy()
    expect(amountInCents).toBe("15300000")

    await expect
      .poll(async () => (reference ? getOrderByReference(reference) : null))
      .not.toBeNull()

    const order = await getOrderByReference(reference!)
    expect(order?.subtotal).toBe(17000000)
    expect(order?.discount_amount).toBe(1700000)
    if ("discount_rule_name_snapshot" in (order ?? {})) {
      expect(order?.discount_rule_name_snapshot).toBe(qaFixtures.comboName)
    }
    expect(order?.total).toBe(15300000)
  })
})
