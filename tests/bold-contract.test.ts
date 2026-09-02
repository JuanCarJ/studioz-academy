import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { createHash, createHmac } from "node:crypto"
import { centsToBoldAmount, boldAmountToCents, buildBoldCheckoutConfig, parseBoldNotification, verifyBoldSignature, queryBoldByReference, boldWebhookSecret, isBoldCheckoutExpired } from "@/lib/bold"
import { mapBoldStatus, isValidTransition } from "@/lib/payments"

beforeEach(() => {
  vi.stubEnv("BOLD_CHECKOUT_ENABLED", "true")
  vi.stubEnv("BOLD_SETTLEMENT_ENABLED", "true")
})
afterEach(() => vi.unstubAllEnvs())
describe("Bold money and signing contract", () => {
  it.each([[100, "1"], [12345, "123.45"], [3900000, "39000"]])("converts %i cents exactly", (cents, pesos) => {
    expect(centsToBoldAmount(cents)).toBe(pesos)
    expect(boldAmountToCents(pesos)).toBe(cents)
  })
  it.each([0, -1, 10.5, NaN, Infinity])("rejects invalid payable amount %s", (value) => expect(() => centsToBoldAmount(value)).toThrow())
  it.each(["1.001", "-1", "1e3", "bad", null])("rejects malformed provider amount %s", (value) => expect(boldAmountToCents(value)).toBeNull())
  it("signs the exact amount passed to Bold and omits personal data", () => {
    const config = buildBoldCheckoutConfig("SZ-test", 12345)
    expect(config.amount).toBe("123.45")
    expect(config.integritySignature).toBe(createHash("sha256").update("SZ-test123.45COPlocal-bold-secret").digest("hex"))
    expect(config).not.toHaveProperty("customerData")
    expect(config).not.toHaveProperty("secret")
  })
  it("fails closed when checkout disabled or reference is invalid", () => {
    expect(() => buildBoldCheckoutConfig("bad/../",100)).toThrow()
    vi.stubEnv("BOLD_CHECKOUT_ENABLED","false")
    expect(() => buildBoldCheckoutConfig("SZ-test",100)).toThrow()
  })
  it("stops reusing an old checkout before the provider consultation window ends", () => {
    const now=Date.parse("2026-09-02T23:00:00Z")
    expect(isBoldCheckoutExpired("2026-09-02T00:00:00Z",now)).toBe(true)
    expect(isBoldCheckoutExpired("2026-09-02T00:00:01Z",now)).toBe(false)
    expect(isBoldCheckoutExpired("invalid",now)).toBe(true)
  })
  it("verifies raw bytes via base64 HMAC, rejecting edited/short signatures", () => {
    const raw = '{"data": 1}'
    const signature = createHmac("sha256", "secret").update(Buffer.from(raw).toString("base64")).digest("hex")
    expect(verifyBoldSignature(raw,signature,"secret")).toBe(true)
    expect(verifyBoldSignature('{"data":1}',signature,"secret")).toBe(false)
    expect(verifyBoldSignature(raw,"short","secret")).toBe(false)
  })
  it("only permits empty sandbox HMAC with explicit opt-in", () => {
    vi.stubEnv("BOLD_ALLOW_EMPTY_SANDBOX_WEBHOOK_KEY","false")
    expect(boldWebhookSecret()).toBe("local-bold-secret")
    vi.stubEnv("BOLD_ALLOW_EMPTY_SANDBOX_WEBHOOK_KEY","true")
    expect(boldWebhookSecret()).toBe("")
    vi.stubEnv("BOLD_ENVIRONMENT","production")
    expect(boldWebhookSecret()).toBe("local-bold-secret")
  })
  it("normalizes only the minimal transaction fields; payer details never persist", () => {
    const event = parseBoldNotification({
      id:"evt-1", type:"SALE_APPROVED", subject:"tx-1",
      data:{ payment_id:"tx-1", amount:{total:125.5,currency:"COP"}, metadata:{reference:"SZ-test"}, payer_email:"sensitive@example.test" },
    })
    expect(event).toMatchObject({ eventId:"evt-1", amountInCents:12550, transactionId:"tx-1", status:"SALE_APPROVED" })
    expect(JSON.stringify(event)).not.toContain("sensitive")
  })
  it("queries only authoritative voucher data, preserving no-transaction as unknown", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ payment_status:"NO_TRANSACTION_FOUND" }))
    expect(await queryBoldByReference("SZ-test")).toBeNull()
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ payment_status:"APPROVED",reference_id:"SZ-test",transaction_id:"tx-1",total:125 }))
    expect(await queryBoldByReference("SZ-test")).toMatchObject({ amountInCents:12500,status:"APPROVED" })
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://payments.api.bold.co/v2/payment-voucher/SZ-test")
  })
  it("does not query with a disabled settlement flag", async () => {
    vi.stubEnv("BOLD_SETTLEMENT_ENABLED","false")
    expect(await queryBoldByReference("SZ-test")).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
  it("preserves approved orders against stale failed/rejected/pending events", () => {
    for (const status of ["FAILED","REJECTED","PENDING","PROCESSING"]) expect(isValidTransition("approved",mapBoldStatus(status)!)).toBe(false)
    expect(mapBoldStatus("VOID_REJECTED")).toBeNull()
    expect(mapBoldStatus("invented")).toBeNull()
  })
})
