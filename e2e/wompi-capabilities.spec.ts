import { expect, test } from "@playwright/test"

import {
  probeWompiScenarioCapability,
  wompiCapabilityProbeScenarios,
} from "./support/wompi"

test.describe.serial("Wompi sandbox capability probes", () => {
  test.setTimeout(90_000)

  test.skip(
    ({ isMobile }) => isMobile,
    "Los capability probes corren una sola vez en desktop porque crean transacciones reales en sandbox."
  )

  // Bancolombia QR queda fuera del gating porque el sandbox del comercio
  // no converge de forma estable y el usuario pidio no usarlo como criterio.
  test.skip("Bancolombia QR se documenta pero no bloquea la suite", async () => {
    const result = await probeWompiScenarioCapability(
      wompiCapabilityProbeScenarios.bancolombiaQrApproved
    )

    expect(result.reference).toBeTruthy()
  })

  test("PCOL no esta habilitado para este comercio sandbox", async () => {
    const result = await probeWompiScenarioCapability(
      wompiCapabilityProbeScenarios.pcolApprovedOnlyPoints
    )

    expect(result.reference).toBeTruthy()
    expect(result.outcome).toBe("unsupported")
    expect(result.transactionId).toBeNull()
    expect(result.orderStatus).toBe("pending")
    expect(result.paymentEventsCount).toBe(0)
    expect(result.reason).toMatch(/No hay una identidad de pago|no tiene habilitado/i)
  })
})
