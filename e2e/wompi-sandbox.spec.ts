import { expect, test } from "@playwright/test"

import { qaCredentials } from "./support/db"
import {
  runWompiSandboxScenario,
  wompiDeterministicScenarios,
} from "./support/wompi"

test.describe.serial("Wompi sandbox automation", () => {
  test.setTimeout(120_000)

  test.skip(
    ({ isMobile }) => isMobile,
    "La suite Wompi corre una sola vez en desktop porque crea transacciones reales en sandbox."
  )

  for (const scenario of wompiDeterministicScenarios) {
    test(scenario.name, async () => {
      const result = await runWompiSandboxScenario(scenario)

      const lastEvent = result.paymentEvents.at(-1)
      const payerEmailInEvent =
        lastEvent?.payload_json?.data?.transaction?.customer_email ?? null

      expect(result.wompiStatus).toBe(scenario.expectedWompiStatus)
      expect(result.order.reference).toBe(result.reference)
      expect(result.order.wompi_transaction_id).toBe(result.transactionId)
      expect(result.order.status).toBe(scenario.expectedOrderStatus)
      expect(result.order.total).toBe(200000)
      expect(result.order.customer_email_snapshot).toBe(qaCredentials.userEmail)
      expect(payerEmailInEvent).toBe(result.payerEmail)
      expect(payerEmailInEvent).not.toBe(result.order.customer_email_snapshot)
      expect(result.order.payment_method).toBe(scenario.config.method)

      expect(lastEvent).toBeTruthy()
      expect(lastEvent?.source).toBe("webhook")
      expect(lastEvent?.external_status).toBe(scenario.expectedWompiStatus)
      expect(lastEvent?.mapped_status).toBe(scenario.expectedOrderStatus)
      expect(lastEvent?.is_applied).toBe(true)
      expect(lastEvent?.reason).toBeNull()

      if (scenario.expectedOrderStatus === "approved") {
        expect(result.enrollmentsCount).toBe(1)
        expect(result.cartItemsCount).toBe(0)
        expect(result.outboxStatus).toBe("pending")
      } else {
        expect(result.enrollmentsCount).toBe(0)
        expect(result.cartItemsCount).toBe(1)
        expect(result.outboxStatus).toBeNull()
      }
    })
  }
})
