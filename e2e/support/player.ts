import { expect } from "@playwright/test"
import type { Page } from "@playwright/test"

interface BunnyEventPayload {
  event: string
  data?: Record<string, unknown>
}

export async function emitBunnyPlayerEvent(
  page: Page,
  payload: BunnyEventPayload
) {
  await page.evaluate((message) => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify(message),
      })
    )
  }, payload)
}

export async function waitForSyntheticPlayerReady(page: Page) {
  const player = page.getByTestId("course-video-player")
  await expect(player).toBeVisible()
  await expect(player).toHaveAttribute("data-message-listener-ready", "true")
  await expect(player).toHaveAttribute("data-progress-flush-ready", "true")
  return player
}
