import { expect } from "@playwright/test"
import type { Page } from "@playwright/test"

interface BunnyEventPayload {
  event: string
  data?: Record<string, unknown>
}

export async function installBunnyPlayerStub(page: Page) {
  await page.addInitScript(() => {
    class StubPlayer {
      iframe: HTMLIFrameElement
      currentTime: number
      listeners: Map<string, Set<(data?: unknown) => void>>

      constructor(iframe: HTMLIFrameElement) {
        this.iframe = iframe
        this.currentTime = 0
        this.listeners = new Map()

        const playerId = String(
          ((window as typeof window & { __codexBunnyPlayerCounter?: number })
            .__codexBunnyPlayerCounter ?? 0) + 1
        )

        ;(window as typeof window & { __codexBunnyPlayerCounter?: number })
          .__codexBunnyPlayerCounter = Number(playerId)
        this.iframe.dataset.stubPlayerId = playerId

        const registry = (
          window as typeof window & {
            __codexBunnyPlayers?: Map<string, StubPlayer>
          }
        ).__codexBunnyPlayers

        if (registry) {
          registry.set(playerId, this)
        } else {
          ;(window as typeof window & { __codexBunnyPlayers?: Map<string, StubPlayer> })
            .__codexBunnyPlayers = new Map([[playerId, this]])
        }

        window.setTimeout(() => {
          this.emit("ready")
        }, 0)
      }

      on(event: string, handler: (data?: unknown) => void) {
        const handlers = this.listeners.get(event) ?? new Set()
        handlers.add(handler)
        this.listeners.set(event, handlers)
      }

      off(event: string, handler: (data?: unknown) => void) {
        const handlers = this.listeners.get(event)
        handlers?.delete(handler)
      }

      setCurrentTime(time: number) {
        this.currentTime = time
        this.emit("timeupdate", { seconds: time })
      }

      emit(event: string, data?: unknown) {
        if (event === "timeupdate" && typeof data === "object" && data !== null) {
          const seconds = (data as { seconds?: number }).seconds
          if (typeof seconds === "number") {
            this.currentTime = seconds
          }
        }

        if (event === "play") {
          this.emit("timeupdate", { seconds: this.currentTime })
        }

        const handlers = this.listeners.get(event)
        handlers?.forEach((handler) => handler(data))
      }
    }

    ;(window as typeof window & { playerjs?: { Player: typeof StubPlayer } }).playerjs = {
      Player: StubPlayer,
    }
  })
}

export async function emitBunnyPlayerEvent(
  page: Page,
  payload: BunnyEventPayload
) {
  await page.evaluate((message) => {
    const wrapper = document.querySelector<HTMLElement>('[data-testid="course-video-player"]')
    const iframe = wrapper?.querySelector<HTMLIFrameElement>("iframe")
    const playerId = iframe?.dataset.stubPlayerId

    if (!playerId) {
      throw new Error("Stub Bunny player has not been initialized")
    }

    const registry = (
      window as typeof window & {
        __codexBunnyPlayers?: Map<string, { emit: (event: string, data?: unknown) => void }>
      }
    ).__codexBunnyPlayers

    const player = registry?.get(playerId)
    if (!player) {
      throw new Error(`Unable to find stub Bunny player ${playerId}`)
    }

    player.emit(message.event, message.data)
  }, payload)
}

export async function waitForPlayerReady(page: Page) {
  const player = page.getByTestId("course-video-player")
  await expect(player).toBeVisible()
  await expect(player).toHaveAttribute("data-player-api-ready", "true")
  await expect(player).toHaveAttribute("data-progress-flush-ready", "true")
  return player
}
