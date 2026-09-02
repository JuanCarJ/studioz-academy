// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { PlayerView } from "@/components/courses/PlayerView"
import { getLastPosition, getSignedVideoUrl, markComplete, markIncomplete, saveVideoPosition } from "@/actions/lessons"
import { resetCourseProgress, updateLastLesson } from "@/actions/progress"

vi.mock("@/actions/lessons", () => ({
  getLastPosition: vi.fn(), getSignedVideoUrl: vi.fn(), markComplete: vi.fn(),
  markIncomplete: vi.fn(), saveVideoPosition: vi.fn(),
}))
vi.mock("@/actions/progress", () => ({ resetCourseProgress: vi.fn(), updateLastLesson: vi.fn() }))
vi.mock("@/hooks/use-csrf-token", () => ({ useCsrfToken: () => ({ csrfToken: "mock" }) }))
vi.mock("@/lib/video-progress-client", () => ({
  postVideoProgressFlush: vi.fn().mockResolvedValue(undefined),
  sendVideoProgressFlushBeacon: vi.fn().mockReturnValue(true),
  registerActiveVideoProgressFlushHandler: () => () => {},
}))
vi.mock("@/components/courses/MediaFallbackPanel", () => ({
  MediaFallbackPanel: ({ message }: { message: string }) => <p>{message}</p>,
}))
vi.mock("@/components/courses/VideoPlayer", () => ({
  VideoPlayer: (props: { signedUrl: string; initialPosition: number; onEnded: () => void; onPause: () => void; onTimeUpdate: (time: number) => void }) => (
    <div data-testid="video" data-url={props.signedUrl} data-position={props.initialPosition}>
      <button onClick={props.onEnded}>Simular fin</button>
      <button onClick={() => { props.onTimeUpdate(42); props.onPause() }}>Simular pausa</button>
    </div>
  ),
}))

const lessons = [
  { id: "one", title: "Primeros pasos", durationSeconds: 90, isFree: false, isCompleted: false },
  { id: "two", title: "Practica", durationSeconds: 120, isFree: false, isCompleted: false, isNew: true },
  { id: "three", title: "Cierre", durationSeconds: 90, isFree: false, isCompleted: false },
]
const base = { courseId: "course", courseTitle: "Baile", lessons, activeLessonId: "one", initialSignedUrl: "url-one" }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
beforeEach(() => {
  vi.mocked(updateLastLesson).mockResolvedValue({})
  vi.mocked(getLastPosition).mockResolvedValue({ position: 0 })
  vi.mocked(getSignedVideoUrl).mockImplementation(async (id) => ({ url: `url-${id}` }))
  vi.mocked(markComplete).mockResolvedValue({})
  vi.mocked(markIncomplete).mockResolvedValue({})
  vi.mocked(saveVideoPosition).mockResolvedValue({})
  vi.mocked(resetCourseProgress).mockResolvedValue({})
})
afterEach(cleanup)

describe("student player", () => {
  it("records access on entry and identifies new lessons accessibly", async () => {
    await act(async () => { render(<PlayerView {...base} />) })
    expect(updateLastLesson).toHaveBeenCalledWith("course", "one")
    expect(screen.getByText("Nuevo")).toBeTruthy()
    expect(screen.getByRole("button", { name: "1. Primeros pasos" }).getAttribute("aria-current")).toBe("step")
  })

  it("clears old video immediately and ignores stale selection responses", async () => {
    const older = deferred<{ url: string }>()
    vi.mocked(getSignedVideoUrl).mockImplementation((id) => id === "two" ? older.promise : Promise.resolve({ url: "url-three" }))
    await act(async () => { render(<PlayerView {...base} />) })
    fireEvent.click(screen.getByRole("button", { name: "2. Practica" }))
    expect(screen.queryByTestId("video")).toBeNull()
    expect(screen.getByText("Cargando lección…")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "3. Cierre" }))
    await waitFor(() => expect(screen.getByTestId("video").dataset.url).toBe("url-three"))
    await act(async () => older.resolve({ url: "stale-two" }))
    expect(screen.getByTestId("video").dataset.url).toBe("url-three")
    expect(updateLastLesson).not.toHaveBeenCalledWith("course", "two")
  })

  it("offers recovery when video loading rejects", async () => {
    vi.mocked(getSignedVideoUrl).mockRejectedValueOnce(new Error("offline"))
    await act(async () => { render(<PlayerView {...base} />) })
    fireEvent.click(screen.getByRole("button", { name: "2. Practica" }))
    await screen.findByText("No pudimos abrir esta lección. Revisa tu conexión y vuelve a intentarlo.")
    fireEvent.click(screen.getByRole("button", { name: "Volver a cargar la lección" }))
    await waitFor(() => expect(screen.getByTestId("video").dataset.url).toBe("url-two"))
  })

  it("does not overwrite an unread saved position with a false zero", async () => {
    vi.mocked(getLastPosition).mockResolvedValueOnce({ position: 0, error: "read failed" })
    await act(async () => { render(<PlayerView {...base} />) })
    fireEvent.click(screen.getByRole("button", { name: "2. Practica" }))
    await screen.findByText("No pudimos recuperar dónde ibas. Vuelve a cargar la lección.")
    expect(screen.queryByTestId("video")).toBeNull()
    expect(saveVideoPosition).not.toHaveBeenCalled()
  })

  it("does not congratulate completion when earlier lessons are unfinished", async () => {
    await act(async () => { render(<PlayerView {...base} activeLessonId="three" />) })
    fireEvent.click(screen.getByRole("button", { name: "Marcar como completada" }))
    await screen.findByText("Todavía tienes lecciones pendientes. Puedes retomarlas cuando quieras.")
    expect(screen.queryByText("¡Felicitaciones! Completaste el curso.")).toBeNull()
    expect(screen.getByRole("button", { name: "Ver lección pendiente" })).toBeTruthy()
  })

  it("only marks completion after a successful write and explains failed writes", async () => {
    vi.mocked(markComplete).mockResolvedValueOnce({ error: "No se pudo guardar." })
    await act(async () => { render(<PlayerView {...base} />) })
    fireEvent.click(screen.getByRole("button", { name: "Marcar como completada" }))
    await screen.findByText("No se pudo guardar.")
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0")
    fireEvent.click(screen.getByRole("button", { name: "Marcar como completada" }))
    await waitFor(() => expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("33"))
  })

  it("supports completion undo", async () => {
    await act(async () => { render(<PlayerView {...base} lessons={lessons.map((l) => ({ ...l, isCompleted: true }))} />) })
    expect(screen.getByText("¡Felicitaciones! Completaste el curso.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Marcar esta lección como pendiente" }))
    await waitFor(() => expect(markIncomplete).toHaveBeenCalledWith("one"))
    await waitFor(() => expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("67"))
  })

  it("keeps failed position saves associated with their lesson and retries them", async () => {
    vi.mocked(saveVideoPosition).mockResolvedValueOnce({ error: "offline" })
    await act(async () => { render(<PlayerView {...base} />) })
    fireEvent.click(screen.getByRole("button", { name: "Simular pausa" }))
    await screen.findByText("No pudimos guardar tu avance. Puedes seguir viendo y volver a intentarlo.")
    fireEvent.click(screen.getByRole("button", { name: "Volver a guardar" }))
    await waitFor(() => expect(saveVideoPosition).toHaveBeenCalledTimes(2))
    expect(saveVideoPosition).toHaveBeenLastCalledWith("one", 42)
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
  })

  it("requires an explicit reset confirmation and resets the visible state", async () => {
    await act(async () => { render(<PlayerView {...base} lessons={lessons.map((l) => ({ ...l, isCompleted: true }))} />) })
    fireEvent.click(screen.getByRole("button", { name: "Reiniciar progreso" }))
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(resetCourseProgress).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Conservar mi progreso" }))
    expect(resetCourseProgress).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Reiniciar progreso" }))
    fireEvent.click(screen.getByRole("button", { name: "Sí, reiniciar progreso" }))
    await waitFor(() => expect(resetCourseProgress).toHaveBeenCalledWith("course", true))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0")
  })

  it("keeps progress when reset fails and exposes recovery", async () => {
    vi.mocked(resetCourseProgress).mockResolvedValueOnce({ error: "No pudimos reiniciar tu progreso." })
    await act(async () => { render(<PlayerView {...base} lessons={lessons.map((l) => ({ ...l, isCompleted: true }))} />) })
    fireEvent.click(screen.getByRole("button", { name: "Reiniciar progreso" }))
    fireEvent.click(screen.getByRole("button", { name: "Sí, reiniciar progreso" }))
    await screen.findByText("No pudimos reiniciar tu progreso.")
    fireEvent.click(screen.getByRole("button", { name: "Conservar mi progreso" }))
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100")
  })
})
