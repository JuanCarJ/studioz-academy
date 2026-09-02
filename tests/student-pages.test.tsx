// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import DashboardPage from "@/app/(dashboard)/dashboard/page"
import ComprasPage from "@/app/(dashboard)/dashboard/compras/page"
import { EnrolledCourseCard } from "@/components/dashboard/EnrolledCourseCard"
import { OrderCard } from "@/components/dashboard/OrderCard"
import { getEnrolledCoursesWithProgress } from "@/actions/progress"
import { getUserOrders } from "@/actions/purchases"
import { getOrderStatusWithFallback } from "@/actions/payments"
import type { EnrolledCourseWithProgress } from "@/actions/progress"
import type { OrderSummary } from "@/actions/purchases"

vi.mock("@/actions/progress", () => ({ getEnrolledCoursesWithProgress: vi.fn() }))
vi.mock("@/actions/purchases", () => ({ getUserOrders: vi.fn() }))
vi.mock("@/actions/payments", () => ({ getOrderStatusWithFallback: vi.fn() }))
vi.mock("@/components/dashboard/CourseSortSelect", () => ({ CourseSortSelect: () => <span>Ordenar cursos</span> }))
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }))
vi.mock("@/lib/env", () => ({ env: { WHATSAPP_NUMBER: () => "" } }))

const item: EnrolledCourseWithProgress = {
  course: { id: "course", title: "Baile inicial", slug: "baile", thumbnail_url: null, category: "baile", is_free: false, instructor: { full_name: "Ana" }, totalLessons: 4 },
  progress: { completedLessons: 2, totalLessons: 4, percentage: 50, isCompleted: false, lastLessonId: "lesson", lastLessonTitle: "Giros", newLessons: 1, hasVideoProgress: true, lastAccessedAt: "2026-09-01T12:00:00Z" },
  enrolledAt: "2026-08-01T12:00:00Z", source: "purchase",
}
const order: OrderSummary = {
  id: "order", reference: "SZ-123", status: "pending", list_subtotal: 100, subtotal: 100,
  course_discount_amount: 100, combo_discount_amount: 0, discount_amount: 100,
  discount_rule_name: "Beca", total: 0, payment_method: "PROMO",
  created_at: "2026-09-01", approved_at: null,
  items: [{ course_title_snapshot: "Baile histórico", price_at_purchase: 0, list_price_snapshot: 100, course_discount_amount_snapshot: 100, price_after_course_discount_snapshot: 0, combo_discount_amount_snapshot: 0, final_price_snapshot: 0 }],
  discount_lines: [],
}
beforeEach(() => {
  vi.mocked(getEnrolledCoursesWithProgress).mockResolvedValue({ courses: [item], total: 25, totalCourses: 30, completedCourses: 5, page: 1, pageSize: 12 })
  vi.mocked(getUserOrders).mockResolvedValue({ orders: [order], total: 13, page: 1, pageSize: 12 })
})
afterEach(cleanup)

describe("student surfaces", () => {
  it("links directly to the last lesson and shows truthful progress and new content", () => {
    render(<EnrolledCourseCard item={item} />)
    expect(screen.getByRole("link", { name: "Continuar: Baile inicial" }).getAttribute("href")).toBe("/dashboard/cursos/baile?lesson=lesson")
    expect(screen.getByText("Giros")).toBeTruthy()
    expect(screen.getByText("1 lección nueva")).toBeTruthy()
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50")
  })
  it("distinguishes begin, resume, and review", () => {
    const { rerender } = render(<EnrolledCourseCard item={{ ...item, progress: { ...item.progress, lastLessonId: null, lastLessonTitle: null, hasVideoProgress: false, percentage: 0, completedLessons: 0 } }} />)
    expect(screen.getByRole("link", { name: "Comenzar: Baile inicial" })).toBeTruthy()
    rerender(<EnrolledCourseCard item={{ ...item, progress: { ...item.progress, percentage: 100, isCompleted: true, completedLessons: 4 } }} />)
    expect(screen.getByRole("link", { name: "Repasar: Baile inicial" })).toBeTruthy()
    expect(screen.getByText("Completado")).toBeTruthy()
  })
  it("uses global counts for filters and preserves sort/filter across pages", async () => {
    render(await DashboardPage({ searchParams: Promise.resolve({ filter: "active", sort: "progressAsc" }) }))
    expect(getEnrolledCoursesWithProgress).toHaveBeenCalledWith({ filter: "active", sort: "progressAsc", page: 1 })
    expect(screen.getByRole("link", { name: "Por completar (25)" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toContain("sort=progressAsc&filter=active&page=2")
  })
  it("offers catalog entry when the student has no courses", async () => {
    vi.mocked(getEnrolledCoursesWithProgress).mockResolvedValue({ courses: [], total: 0, totalCourses: 0, completedCourses: 0, page: 1, pageSize: 12 })
    render(await DashboardPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText("Aún no tienes cursos")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Explorar cursos" }).getAttribute("href")).toBe("/cursos")
  })
  it("does not present a data outage as an empty enrollment", async () => {
    vi.mocked(getEnrolledCoursesWithProgress).mockResolvedValue({ courses: [], total: 0, totalCourses: 0, completedCourses: 0, page: 1, pageSize: 12, error: "No pudimos cargar tus cursos." })
    render(await DashboardPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole("alert").textContent).toContain("No pudimos cargar tus cursos.")
    expect(screen.queryByText("Aún no tienes cursos")).toBeNull()
    expect(screen.getByRole("link", { name: "Volver a intentar" })).toBeTruthy()
  })
  it("distinguishes an empty completion filter from no enrollment", async () => {
    vi.mocked(getEnrolledCoursesWithProgress).mockResolvedValue({ courses: [], total: 0, totalCourses: 3, completedCourses: 0, page: 1, pageSize: 12 })
    render(await DashboardPage({ searchParams: Promise.resolve({ filter: "completed" }) }))
    expect(screen.getByText("Aún no has completado un curso")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Ver todos mis cursos" })).toBeTruthy()
  })
  it("paginates purchases using the total and keeps promotional orders distinct", async () => {
    render(await ComprasPage({ searchParams: Promise.resolve({ page: "1" }) }))
    expect(screen.getByText("13 compras registradas")).toBeTruthy()
    expect(screen.getByText("Promoción (sin cobro)")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toBe("/dashboard/compras?page=2")
  })
  it("keeps purchase support contextual and rechecks without hiding the updated outcome", async () => {
    vi.mocked(getOrderStatusWithFallback).mockResolvedValue({ order: { status: "approved" } } as Awaited<ReturnType<typeof getOrderStatusWithFallback>>)
    render(<OrderCard order={order} whatsappNumber="573001234567" />)
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    expect(screen.getByRole("link", { name: "Pedir ayuda con esta compra" }).getAttribute("href")).toContain("SZ-123")
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Consultar mi pago" })) })
    expect(screen.getByRole("status").textContent).toBe("Estado actualizado.")
    expect(screen.getByRole("link", { name: "Ir a mis cursos" })).toBeTruthy()
  })
  it("handles failed payment checks without leaking provider errors", async () => {
    vi.mocked(getOrderStatusWithFallback).mockRejectedValue(new Error("provider secret failure"))
    render(<OrderCard order={order} />)
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    fireEvent.click(screen.getByRole("button", { name: "Consultar mi pago" }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Revisa tu conexión"))
    expect(screen.queryByText(/provider secret/)).toBeNull()
  })
})
