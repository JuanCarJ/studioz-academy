import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "@playwright/test"

const origin = "http://127.0.0.1:3100"
const browser = await chromium.launch({ channel: "chrome" })
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.route("**/*", route => {
    const url = new URL(route.request().url())
    return url.origin === origin || url.protocol === "data:" ? route.continue() : route.abort()
  })
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  await page.addInitScript(() => {
    window.__qaCspViolations = []
    document.addEventListener("securitypolicyviolation", event => {
      window.__qaCspViolations.push(event.effectiveDirective)
    })
  })
  for (const path of ["/login", "/registro", "/contacto", "/pago/retorno"]) {
    const response = await page.goto(origin + path)
    assert.equal(response.status(), 200, path)
    const policy = response.headers()["content-security-policy"]
    assert.match(policy, /nonce-/)
    assert.match(policy, /frame-ancestors 'none'/)
    await page.locator("h1").first().waitFor()
    // All executable inline scripts, including hydration and theme, carry a nonce.
    assert.equal(await page.locator("script:not([src])").evaluateAll(scripts =>
      scripts.filter(s => (!s.type || s.type === "text/javascript") && !s.nonce).length), 0, path)
    assert.deepEqual(await page.evaluate(() => window.__qaCspViolations), [], path)
  }
  await page.goto(origin + "/dashboard")
  assert.match(page.url(), /\/login\?redirect=/)
  await page.locator('input[name="csrfToken"]').first().waitFor({ state: "attached" })
  await page.waitForFunction(() => Boolean(document.querySelector('input[name="csrfToken"]')?.value))
  assert.deepEqual(errors, [], "No runtime page errors")
  for (const path of ["/api/jobs/payments/reconcile", "/api/jobs/email/outbox", "/api/jobs/bunny/reconcile"]) {
    const result = await context.request.get(origin + path)
    assert.equal(result.status(), 401, path)
  }
  const webhook = await context.request.post(origin + "/api/webhooks/bold", { data: {} })
  assert.equal(webhook.status(), 503, "Bold disabled by default")
  await mkdir("output/playwright", { recursive: true })
  await page.screenshot({ path: "output/playwright/next-login-csp.png", fullPage: true })
  console.log("Next local smoke passed: 4 routes, protected redirect, CSRF initialization, nonce/hydration/CSP, 3 unauthorized jobs, disabled Bold webhook. No real provider or DB.")
} finally {
  await browser.close()
}
