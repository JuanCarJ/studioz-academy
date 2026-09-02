import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn(), from: vi.fn(), rate: vi.fn(), cart: vi.fn() }))
vi.mock("@/lib/supabase/auth", () => ({ getCurrentUser: mock.user }))
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: () => ({ rpc: mock.rpc, from: mock.from }) }))
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }))
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mock.rate }))
vi.mock("@/lib/cart", () => ({ resolveCartStateForUser: mock.cart }))
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("REDIRECT:" + url) } }))
import { getOrderStatusWithFallback } from "@/actions/payments"
import { createOrder } from "@/actions/checkout"
import { createCheckoutOrder } from "@/lib/checkout-order"
import PaymentCheckoutPage from "@/app/(public)/pago/checkout/page"
import { renderToStaticMarkup } from "react-dom/server"

const pending = { id:"order-1", reference:"SZ-test", user_id:"user-1", total:10000,currency:"COP",status:"pending",
  payment_provider:"bold",payment_environment:"sandbox",created_at:"2026-09-02T01:00:00.000Z",
  customer_email_snapshot:"private@example.test",customer_phone_snapshot:"secret" }
function query(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const name of ["select","eq","neq","order","limit","gte","lt"]) chain[name] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => result)
  chain.then = (resolve: (value:unknown)=>unknown) => Promise.resolve(result).then(resolve)
  return chain
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-02T01:05:00.000Z"))
  mock.user.mockResolvedValue({ id:"user-1",role:"user",full_name:"Test",email:"test@example.test",phone:null })
  mock.rate.mockResolvedValue({ allowed:true })
  mock.rpc.mockResolvedValue({data:true,error:null})
  vi.stubEnv("BOLD_SETTLEMENT_ENABLED","true")
  vi.stubEnv("BOLD_CHECKOUT_ENABLED","true")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
describe("owned payment return and atomic checkout", () => {
  it("does not use service client or provider before authentication", async () => {
    mock.user.mockResolvedValue(null)
    expect(await getOrderStatusWithFallback("SZ-test","attacker-tx")).toEqual({order:null})
    expect(mock.from).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it("requires ownership in the query before lookup even for a known reference", async () => {
    const chain = query({ data:null,error:null })
    mock.from.mockReturnValue(chain)
    expect(await getOrderStatusWithFallback("SZ-test")).toEqual({order:null})
    expect(chain.eq).toHaveBeenCalledWith("user_id","user-1")
    expect(fetch).not.toHaveBeenCalled()
  })
  it("re-reads database truth after an authoritative event, without leaking PII", async () => {
    mock.from.mockReturnValueOnce(query({data:pending,error:null}))
      .mockReturnValueOnce(query({data:{...pending,status:"approved"},error:null}))
      .mockReturnValueOnce(query({data:[{course_title_snapshot:"Course",courses:{slug:"course"}}],error:null}))
      .mockReturnValueOnce(query({count:0,error:null}))
    vi.mocked(fetch).mockResolvedValue(Response.json({ payment_status:"APPROVED",reference_id:"SZ-test",transaction_id:"tx",total:100 }))
    mock.rpc.mockImplementation(async (name:string) => ({ data:name==="apply_payment_event" ? {applied:true,status:"approved"} : true,error:null }))
    const result=await getOrderStatusWithFallback("SZ-test")
    expect(result.order).toEqual({reference:"SZ-test",status:"approved",total:10000,currency:"COP"})
    expect(JSON.stringify(result)).not.toContain("private")
    expect(mock.rpc).toHaveBeenCalledWith("apply_payment_event",expect.objectContaining({p_event:expect.objectContaining({amountInCents:10000})}))
  })
  it("does not invent approval if applying the event fails", async () => {
    mock.from.mockReturnValue(query({data:pending,error:null}))
    vi.mocked(fetch).mockResolvedValue(Response.json({payment_status:"APPROVED",reference_id:"SZ-test",transaction_id:"tx",total:100}))
    mock.rpc.mockImplementation(async (name:string) => name==="apply_payment_event" ? {data:null,error:{message:"db failed"}} : {data:true,error:null})
    expect((await getOrderStatusWithFallback("SZ-test")).order?.status).toBe("pending")
  })
  it("checkout writes a single RPC and redirects only after committed response", async () => {
    mock.cart.mockResolvedValue({ items:[{ course:{id:"course-1",title:"Test"},listPrice:10000,courseDiscountAmount:0,
      priceAfterCourseDiscount:10000,comboDiscountAmount:0,finalPrice:10000 }], primaryComboRuleIds:[],
      primaryComboRuleName:null,listSubtotal:10000,subtotal:10000,courseDiscountAmount:0,comboDiscountAmount:0,
      discountAmount:0,total:10000,appliedDiscountLines:[] })
    mock.rpc.mockResolvedValue({data:{id:"order-1",reference:"SZ-committed",total:10000,status:"pending"},error:null})
    await expect(createOrder()).rejects.toThrow("REDIRECT:/pago/checkout?reference=SZ-committed")
    expect(mock.rpc).toHaveBeenCalledTimes(1)
    expect(mock.rpc).toHaveBeenCalledWith("create_checkout_order",expect.objectContaining({p_user_id:"user-1",p_cart_hash:expect.stringMatching(/^[a-f0-9]{64}$/)}))
    expect(mock.from).not.toHaveBeenCalled()
  })
  it("does not send zero-total orders to a provider", async () => {
    mock.rpc.mockResolvedValue({data:{id:"order-1",reference:"SZ-free",total:0,status:"approved"},error:null})
    const result=await createCheckoutOrder({userId:"user-1",customerName:"Test",customerEmail:"test@example.test",
      items:[{courseId:"course-1",courseTitle:"Test",listPrice:100,courseDiscountAmount:100,priceAfterCourseDiscount:0,comboDiscountAmount:0,finalPrice:0}],
      pricingSnapshot:{},discountLines:[{scope:"course",kind:"course_discount",amount:100}]})
    expect(result.status).toBe("approved")
    expect(fetch).not.toHaveBeenCalled()
  })
  it("rejects inconsistent monetary snapshots before RPC", async () => {
    await expect(createCheckoutOrder({userId:"u",customerName:"T",customerEmail:"e",items:[{courseId:"c",courseTitle:"c",listPrice:100,courseDiscountAmount:0,priceAfterCourseDiscount:90,comboDiscountAmount:0,finalPrice:90}],pricingSnapshot:{},discountLines:[]})).rejects.toThrow("pricing")
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it("never emits a Bold configuration after live availability or support access changed", async () => {
    mock.rpc.mockResolvedValue({data:{order:pending,eligible:false,reason:"items_unavailable"},error:null})
    const markup=renderToStaticMarkup(await PaymentCheckoutPage({searchParams:Promise.resolve({reference:"SZ-test"})}))
    expect(markup).toContain("Esta orden necesita revisión")
    expect(markup).not.toContain("Pagar con Bold")
    expect(markup).not.toContain("local-bold-identity")
    expect(mock.rpc).toHaveBeenCalledWith("get_payable_checkout_order",{p_reference:"SZ-test",p_user_id:"user-1",p_environment:"sandbox"})
    expect(fetch).not.toHaveBeenCalled()
  })
})
