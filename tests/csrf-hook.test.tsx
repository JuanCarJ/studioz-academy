// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { useCsrfToken } from "@/hooks/use-csrf-token"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
const response = (csrfToken: unknown) => ({ ok: true, json: async () => ({ csrfToken }) })

beforeEach(() => {
  sessionStorage.setItem("studioz:csrf-token", "stale-token-from-previous-session")
  vi.spyOn(Storage.prototype, "getItem")
  vi.spyOn(Storage.prototype, "setItem")
})
afterEach(() => { cleanup(); sessionStorage.clear() })

describe("CSRF token initialization", () => {
  it("stays empty while loading and uses only a fresh credentialed no-store response", async () => {
    const pending = deferred<ReturnType<typeof response>>()
    const fetchMock = vi.fn().mockReturnValue(pending.promise)
    vi.stubGlobal("fetch", fetchMock)
    const { result } = renderHook(() => useCsrfToken())
    expect(result.current).toEqual({ csrfToken: "", isLoading: true, error: null })
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/csrf", {
      method: "GET", cache: "no-store", credentials: "include",
    })
    await act(async () => pending.resolve(response("fresh-token")))
    expect(result.current).toEqual({ csrfToken: "fresh-token", isLoading: false, error: null })
    expect(Storage.prototype.getItem).not.toHaveBeenCalled()
    expect(Storage.prototype.setItem).not.toHaveBeenCalled()
  })

  it("fails closed on a fetch rejection even if session storage contains an old token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    const { result } = renderHook(() => useCsrfToken())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.csrfToken).toBe("")
    expect(result.current.error).toContain("Recarga la página")
    expect(Storage.prototype.getItem).not.toHaveBeenCalled()
    expect(Storage.prototype.setItem).not.toHaveBeenCalled()
  })

  it.each([
    { name: "HTTP rejection", value: { ok: false, json: async () => ({ csrfToken: "untrusted-token" }) } },
    { name: "missing token", value: { ok: true, json: async () => ({}) } },
    { name: "empty token", value: response("") },
    { name: "non-string token", value: response(123) },
    { name: "malformed JSON", value: { ok: true, json: async () => { throw new Error("malformed response") } } },
  ])("fails closed for $name without falling back to stale storage", async ({ value }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(value))
    const { result } = renderHook(() => useCsrfToken())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.csrfToken).toBe("")
    expect(result.current.error).toContain("seguridad del formulario")
    expect(Storage.prototype.getItem).not.toHaveBeenCalled()
  })

  it("ignores a late response after the form unmounts", async () => {
    const pending = deferred<ReturnType<typeof response>>()
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise))
    const { result, unmount } = renderHook(() => useCsrfToken())
    unmount()
    await act(async () => pending.resolve(response("late-token")))
    expect(result.current.csrfToken).toBe("")
    expect(Storage.prototype.setItem).not.toHaveBeenCalled()
  })
})
