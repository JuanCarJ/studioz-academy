import { beforeEach, describe, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({ admin: vi.fn(), from: vi.fn(), insert: vi.fn(), limit: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: mock.admin }))
vi.mock("@/lib/security/rate-limit", () => ({
  enforcePublicRateLimit: mock.limit,
  RATE_LIMIT_MESSAGE: "Espera unos minutos antes de volver a intentarlo.",
}))
import { submitContactMessage } from "@/actions/contact"

const valid = {
  name: "Ana Torres", email: "ana@example.invalid", subject: "Cursos online",
  message: "Quiero conocer los horarios de los cursos.",
}

beforeEach(() => {
  mock.limit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
  mock.insert.mockResolvedValue({ error: null })
  mock.from.mockReturnValue({ insert: mock.insert })
  mock.admin.mockReturnValue({ from: mock.from })
})

describe("public contact action", () => {
  it("accepts the honeypot silently without rate limiting or writing", async () => {
    expect(await submitContactMessage({ ...valid, name: "", email: "", message: "", website: "bot.invalid" })).toEqual({ success: true })
    expect(mock.limit).not.toHaveBeenCalled()
    expect(mock.admin).not.toHaveBeenCalled()
  })

  it.each([
    { name: " A " },
    { name: "A".repeat(81) },
    { email: "invalid" },
    { email: "ana @example.invalid" },
    { email: "a".repeat(245) + "@example.invalid" },
    { message: "123456789" },
    { message: "a".repeat(4001) },
    { subject: "" },
    { subject: "Administración interna" },
  ])("rejects invalid form boundaries before data access: %o", async (input) => {
    expect(await submitContactMessage({ ...valid, ...input })).toHaveProperty("error")
    expect(mock.limit).not.toHaveBeenCalled()
    expect(mock.admin).not.toHaveBeenCalled()
  })

  it("normalizes name, email and message before limiting and storing", async () => {
    expect(await submitContactMessage({
      ...valid, name: "  Ana Torres  ", email: "  ANA@EXAMPLE.INVALID ",
      message: "  Quiero conocer los horarios de los cursos.  ", website: "",
    })).toEqual({ success: true })
    expect(mock.limit).toHaveBeenCalledExactlyOnceWith("contact", "ana@example.invalid", 3, 3600)
    expect(mock.from).toHaveBeenCalledExactlyOnceWith("contact_messages")
    expect(mock.insert).toHaveBeenCalledExactlyOnceWith(valid)
  })

  it.each(["Clases de baile", "Tatuajes", "Cursos online", "Ayuda con una compra"])("accepts approved subject %s", async (subject) => {
    expect(await submitContactMessage({ ...valid, subject })).toEqual({ success: true })
    expect(mock.insert).toHaveBeenCalledWith({ ...valid, subject })
  })

  it("accepts inclusive length limits", async () => {
    expect(await submitContactMessage({ ...valid, name: "AB", message: "a".repeat(10) })).toEqual({ success: true })
    expect(await submitContactMessage({ ...valid, name: "a".repeat(80), message: "a".repeat(4000) })).toEqual({ success: true })
  })

  it("does not create a data client or insert after a rate-limit denial", async () => {
    mock.limit.mockResolvedValue({ allowed: false, retryAfterSeconds: 100 })
    expect(await submitContactMessage(valid)).toEqual({ error: "Espera unos minutos antes de volver a intentarlo." })
    expect(mock.admin).not.toHaveBeenCalled()
    expect(mock.insert).not.toHaveBeenCalled()
  })

  it("returns actionable copy without leaking the database failure", async () => {
    mock.insert.mockResolvedValue({ error: { code: "42501", message: "internal-role-secret" } })
    const result = await submitContactMessage(valid)
    expect(result).toEqual({ error: "No pudimos enviar tu mensaje. Inténtalo más tarde o escríbenos por WhatsApp." })
    expect(result).not.toHaveProperty("success")
    expect(JSON.stringify(result)).not.toContain("internal-role-secret")
  })
})
