// @vitest-environment jsdom
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { VideoPlayer } from "@/components/courses/VideoPlayer"
const scriptMock = vi.hoisted(() => ({ src: "", onError: (() => {}) as () => void }))
vi.mock("next/script", () => ({ default: ({ src, onError }: { src: string; onError: () => void }) => {
  scriptMock.src = src; scriptMock.onError = onError
  return null
},
}))

const url = "https://iframe.mediadelivery.net/embed/10/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa?token=test"
afterEach(() => { cleanup(); delete window.playerjs; document.querySelectorAll("script").forEach((script) => script.remove()) })
function mockPlayer() {
  const handlers: Record<string, (value?: unknown) => void> = {}
  window.playerjs = { Player: class {
    on(event: string, callback: (value?: unknown) => void) { handlers[event] = callback }
    off() {}
  } }
  return handlers
}
it("warns about position tracking if the pinned script fails, preserving the iframe", async () => {
  await act(async () => { render(<VideoPlayer signedUrl={url} onTimeUpdate={vi.fn()} />) })
  expect(scriptMock.src).toBe("https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js")
  await act(async () => { scriptMock.onError() })
  expect(screen.getByRole("status").textContent).toContain("posición podría no guardarse")
  expect(screen.getByTitle("Reproductor del curso")).toBeTruthy()
})
it("reports API readiness only after the player ready event", async () => {
  const handlers = mockPlayer()
  await act(async () => { render(<VideoPlayer signedUrl={url} />) })
  expect(screen.getByTestId("course-video-player").dataset.playerApiReady).toBe("false")
  act(() => handlers.ready())
  expect(screen.getByTestId("course-video-player").dataset.playerApiReady).toBe("true")
})
it("rejects invalid time events and forwards finite progress", async () => {
  const handlers = mockPlayer(); const onTimeUpdate = vi.fn()
  await act(async () => { render(<VideoPlayer signedUrl={url} onTimeUpdate={onTimeUpdate} />) })
  act(() => { handlers.timeupdate({ seconds: -2 }); handlers.timeupdate(Infinity); handlers.timeupdate({ seconds: 18 }) })
  expect(onTimeUpdate).toHaveBeenCalledExactlyOnceWith(18)
})
it("provides a retry action after a playback error", async () => {
  const handlers = mockPlayer()
  await act(async () => { render(<VideoPlayer signedUrl={url} />) })
  act(() => handlers.error())
  expect(screen.getByRole("alert").textContent).toContain("No pudimos reproducir")
  fireEvent.click(screen.getByRole("button", { name: "Reintentar video" }))
  expect(screen.queryByRole("alert")).toBeNull()
})
