import { expect,it,vi } from "vitest"
vi.mock("@react-email/components",()=>({render:async()=>"<p>Test</p>"}))
import { sendEmail } from "@/lib/resend"
it("sends stable provider idempotency and an abortable request without logging PII",async()=>{
  vi.mocked(fetch).mockResolvedValue(Response.json({id:"message-1"}))
  const result=await sendEmail({to:"test@example.test",subject:"Test",react:null as never,idempotencyKey:"purchase/order-1/v1"})
  expect(result).toEqual({id:"message-1"})
  expect(fetch).toHaveBeenCalledWith("https://api.resend.com/emails",expect.objectContaining({
    method:"POST",headers:expect.objectContaining({"Idempotency-Key":"purchase/order-1/v1"}),signal:expect.any(AbortSignal),
  }))
})
