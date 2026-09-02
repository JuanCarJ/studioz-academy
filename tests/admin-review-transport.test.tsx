// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { AdminReview } from "@/actions/admin/reviews"

const mock = vi.hoisted(() => ({ moderate: vi.fn(), remove: vi.fn() }))
vi.mock("@/actions/admin/reviews", () => ({ moderateReview: mock.moderate, deleteReviewAdmin: mock.remove }))
import { ReviewsTable } from "@/components/admin/ReviewsTable"

const review: AdminReview = {
  id: "review-a", user_id: "student-a", course_id: "course-a", rating: 5,
  text: "Excelente curso", is_visible: true, created_at: "2026-09-02T12:00:00Z",
  updated_at: "2026-09-02T12:00:00Z", user: { id: "student-a", full_name: "Ana", avatar_url: null },
  course: { id: "course-a", title: "Salsa", slug: "salsa" },
}

beforeEach(() => {
  // The application uses Next's automatic JSX transform; Vitest's plain TSX uses React.
  vi.stubGlobal("React", React)
})
afterEach(cleanup)

it("restores the visibility toggle and explains an unconfirmed transport result", async () => {
  mock.moderate.mockRejectedValue(new Error("connection lost"))
  render(<ReviewsTable reviews={[review]} />)
  const toggle = screen.getAllByRole("switch")[0]
  fireEvent.click(toggle)
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "No pudimos confirmar el cambio. Recarga las reseñas antes de intentarlo otra vez.")
  expect(toggle.getAttribute("aria-checked")).toBe("true")
  expect(mock.moderate).toHaveBeenCalledExactlyOnceWith("review-a", false)
})

it("keeps the deletion dialog open with recovery guidance on a lost response", async () => {
  mock.remove.mockRejectedValue(new Error("connection lost"))
  render(<ReviewsTable reviews={[review]} />)
  fireEvent.click(screen.getAllByRole("button", { name: "Eliminar" })[0])
  const dialog = screen.getByRole("dialog")
  fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }))
  expect(await within(dialog).findByRole("alert")).toHaveProperty("textContent", "No pudimos confirmar la eliminación. Recarga las reseñas para comprobar el estado.")
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(mock.remove).toHaveBeenCalledExactlyOnceWith("review-a")
})
