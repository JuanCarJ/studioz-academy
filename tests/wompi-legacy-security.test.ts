import { afterEach,beforeEach,expect,it,vi } from "vitest"
import { createHash } from "node:crypto"
const mock=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock("@/lib/supabase/admin",()=>({createServiceRoleClient:()=>({rpc:mock.rpc})}))
import { POST } from "@/app/api/webhooks/wompi/route"
import { verifyWebhookSignature, type WompiWebhookEvent } from "@/lib/wompi"
const timestamp=1788350400
function event(reference:string){
  return {data:{transaction:{id:"tx-1",status:"APPROVED",amount_in_cents:10000,currency:"COP",reference}},
    timestamp,signature:{properties:["transaction.id","transaction.status","transaction.amount_in_cents"],
      checksum:createHash("sha256").update("tx-1APPROVED10000"+timestamp+"legacy-secret").digest("hex")}}
}
beforeEach(()=>{
  vi.stubEnv("WOMPI_LEGACY_SETTLEMENT_ENABLED","true")
  vi.stubEnv("WOMPI_EVENTS_SECRET","legacy-secret")
  vi.stubEnv("NEXT_PUBLIC_WOMPI_PUBLIC_KEY","legacy-public-test")
  mock.rpc.mockResolvedValue({data:true,error:null})
})
afterEach(()=>vi.unstubAllEnvs())
it("rejects an altered unsigned reference despite the exact same valid checksum",async()=>{
  vi.mocked(fetch).mockResolvedValue(Response.json({data:{id:"tx-1",status:"APPROVED",amount_in_cents:10000,currency:"COP",reference:"SZ-real"}}))
  const original=event("SZ-real")
  const altered=event("SZ-other")
  expect(original.signature.checksum).toBe(altered.signature.checksum)
  const response=await POST(new Request("https://app.test",{method:"POST",body:JSON.stringify(altered)}))
  expect(response.status).toBe(400)
  expect(mock.rpc).not.toHaveBeenCalled()
})
it("rejects replacing signed property paths with an attacker-controlled concatenation",async()=>{
  const copied=event("SZ-real")
  const altered={...copied,signature:{...copied.signature,properties:["transaction.signatureValue"]},data:{transaction:{
    id:"attacker-tx",status:"APPROVED",amount_in_cents:10000,currency:"COP",reference:"SZ-other",signatureValue:"tx-1APPROVED10000",
  }}}
  expect(verifyWebhookSignature(altered as unknown as WompiWebhookEvent,"legacy-secret")).toBe(false)
  expect((await POST(new Request("https://app.test",{method:"POST",body:JSON.stringify(altered)}))).status).toBe(401)
  expect(fetch).not.toHaveBeenCalled()
  expect(mock.rpc).not.toHaveBeenCalled()
})
it("persists only canonical legacy identity after transaction lookup",async()=>{
  vi.mocked(fetch).mockResolvedValue(Response.json({data:{id:"tx-1",status:"APPROVED",amount_in_cents:10000,currency:"COP",reference:"SZ-real"}}))
  const response=await POST(new Request("https://app.test",{method:"POST",body:JSON.stringify(event("SZ-real"))}))
  expect(response.status).toBe(200)
  expect(mock.rpc).toHaveBeenCalledWith("receive_payment_notification",expect.objectContaining({p_event:expect.objectContaining({reference:"SZ-real",transactionId:"tx-1",status:"APPROVED"})}))
})
it("fails closed if the canonical transaction cannot be looked up",async()=>{
  vi.mocked(fetch).mockResolvedValue(new Response(null,{status:503}))
  expect((await POST(new Request("https://app.test",{method:"POST",body:JSON.stringify(event("SZ-real"))}))).status).toBe(503)
  expect(mock.rpc).not.toHaveBeenCalled()
})
