// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({ retry: vi.fn(), refresh: vi.fn() }))
vi.mock("@/actions/admin/account-cleanup", () => ({ retryAccountAuthCleanup: mock.retry }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }))
import { AccountCleanupPanel } from "@/components/admin/AccountCleanupPanel"

beforeEach(() => { vi.stubGlobal("React", React) })
afterEach(cleanup)

it("shows durable pending status and preserves a recovery path when transport fails", async () => {
  mock.retry.mockRejectedValue(new Error("offline"))
  render(<AccountCleanupPanel userId="user-a" completedAt={null} attempts={2} />)
  expect(screen.getByText(/Falta confirmar/)).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Reintentar eliminación de acceso" }))
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "No pudimos confirmar el resultado. Actualiza la ficha antes de reintentar.")
  expect(screen.queryByRole("status")).toBeNull()
  expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false)
})

it("removes the retry button only after confirmed completion", async () => {
  mock.retry.mockResolvedValue({ success: true })
  render(<AccountCleanupPanel userId="user-a" completedAt={null} attempts={2} />)
  fireEvent.click(screen.getByRole("button"))
  expect(await screen.findByRole("status")).toHaveProperty("textContent", "Eliminación confirmada.")
  expect(screen.queryByRole("button")).toBeNull()
  expect(mock.refresh).toHaveBeenCalledOnce()
})
