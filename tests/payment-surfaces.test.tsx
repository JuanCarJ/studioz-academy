// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
const mock=vi.hoisted(()=>({status:vi.fn()}))
vi.mock("@/actions/payments",()=>({getOrderStatusWithFallback:mock.status}))
import { PaymentReturnView } from "@/components/payment/PaymentReturnView"
import { BoldCheckoutView } from "@/components/payment/BoldCheckoutView"
import type { BoldCheckoutConfig } from "@/types/payment"

const pending={reference:"SZ-test",status:"pending" as const,total:10000,currency:"COP"}
const config:BoldCheckoutConfig={orderId:"SZ-test",amount:"100",currency:"COP",apiKey:"public-test",integritySignature:"opaque",description:"Test",redirectionUrl:"https://app.test/pago/retorno",originUrl:"https://app.test/carrito"}
beforeEach(()=>vi.useFakeTimers())
afterEach(()=>{cleanup();vi.useRealTimers();delete window.BoldCheckout;document.querySelectorAll('script[src*="checkout.bold.co"]').forEach((s)=>s.remove())})
it("updates pending return to persisted approval automatically, then stops polling",async()=>{
  mock.status.mockResolvedValue({order:{...pending,status:"approved"},orderItems:[{courseTitle:"Curso",courseSlug:"curso"}],isFirstPurchase:true})
  render(<PaymentReturnView reference="SZ-test" initialOrder={pending} />)
  expect(screen.getByText("Procesando pago...")).toBeTruthy()
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000)})
  expect(screen.getByText("Compra exitosa!")).toBeTruthy()
  expect(screen.getByRole("link",{name:"Comenzar tu primera leccion"}).getAttribute("href")).toBe("/dashboard/cursos/curso")
  await act(async()=>{await vi.advanceTimersByTimeAsync(30000)})
  expect(mock.status).toHaveBeenCalledTimes(1)
})
it("keeps pending truth when refresh fails and warns not to pay again",async()=>{
  mock.status.mockRejectedValue(new Error("offline"))
  render(<PaymentReturnView reference="SZ-test" initialOrder={pending} />)
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000)})
  expect(screen.getByRole("alert").textContent).toContain("no necesitas repetir el pago")
  expect(screen.getByText("Procesando pago...")).toBeTruthy()
})
it("provides login recovery without exposing whether a reference belongs to someone else",()=>{
  render(<PaymentReturnView reference="SZ-test" initialOrder={null} />)
  expect(screen.getByRole("link",{name:"Iniciar sesión"}).getAttribute("href")).toContain("/login?redirect=")
  expect(screen.queryByText(/no encontramos una orden/i)).toBeNull()
})
it("opens Bold only after an explicit click and a loaded constructor",async()=>{
  const open=vi.fn()
  window.BoldCheckout=class { open=open }
  render(<BoldCheckoutView config={config} />)
  expect(open).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button",{name:"Pagar con Bold"}))
  expect(open).toHaveBeenCalledTimes(1)
})
it("offers recovery for a script timeout without creating another order",async()=>{
  render(<BoldCheckoutView config={config} />)
  await act(async()=>{await vi.advanceTimersByTimeAsync(12000)})
  expect(screen.getByRole("alert").textContent).toContain("No pudimos cargar")
  expect(screen.getByRole("button",{name:"Intentar de nuevo"})).toBeTruthy()
  expect(fetch).not.toHaveBeenCalled()
})
