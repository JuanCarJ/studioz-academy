import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"

const mock=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),send:vi.fn()}))
vi.mock("@/lib/supabase/admin",()=>({createServiceRoleClient:()=>({rpc:mock.rpc,from:mock.from})}))
vi.mock("@/lib/resend",()=>({sendEmail:mock.send}))
vi.mock("@/emails/PurchaseConfirmation",()=>({PurchaseConfirmation:()=>null}))
import { runCronJob } from "@/lib/cron"
import { processEmailOutboxBatch } from "@/lib/email-outbox"
import { POST as boldWebhook } from "@/app/api/webhooks/bold/route"
import { GET as paymentGet, POST as paymentPost } from "@/app/api/jobs/payments/reconcile/route"
import { GET as emailGet, POST as emailPost } from "@/app/api/jobs/email/outbox/route"

beforeEach(()=>{
  mock.rpc.mockResolvedValue({data:true,error:null})
  vi.stubEnv("BOLD_SETTLEMENT_ENABLED","true")
})
afterEach(()=>vi.unstubAllEnvs())
describe("jobs and durable notifications",()=>{
  it("scheduled GET handlers exist and retain authenticated POST compatibility",()=>{
    expect(paymentGet).toBe(paymentPost)
    expect(emailGet).toBe(emailPost)
  })
  it("rejects unauthenticated cron before acquiring a lease",async()=>{
    const work=vi.fn()
    const response=await runCronJob(new Request("https://app.test/api/job"),"test",work)
    expect(response.status).toBe(401)
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(work).not.toHaveBeenCalled()
  })
  it("skips overlapping workers and does not release someone else's lock",async()=>{
    mock.rpc.mockResolvedValue({data:false,error:null})
    const work=vi.fn()
    const response=await runCronJob(new Request("https://app.test",{headers:{Authorization:"Bearer local-test-cron-secret"}}),"test",work)
    expect(await response.json()).toMatchObject({skipped:true})
    expect(work).not.toHaveBeenCalled()
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })
  it("always releases its own lease when worker throws",async()=>{
    const response=await runCronJob(new Request("https://app.test",{headers:{Authorization:"Bearer local-test-cron-secret"}}),"test",async()=>{throw new Error("fail")})
    expect(response.status).toBe(503)
    const claim=mock.rpc.mock.calls[0][1]
    expect(mock.rpc).toHaveBeenCalledWith("release_job_lease",{p_name:"test",p_token:claim.p_token})
  })
  it("logs duration, result and whitelisted numeric counts without provider objects or PII",async()=>{
    const log=vi.spyOn(console,"info").mockImplementation(()=>undefined)
    await runCronJob(new Request("https://app.test",{headers:{Authorization:"Bearer local-test-cron-secret"}}),"email-outbox",async()=>({
      purchases:{sent:2,failed:0,email:"private@example.test"}, provider:{token:"sensitive"}, reference:"sensitive", processed:2,
    }))
    const entry=JSON.parse(log.mock.calls[0][0] as string)
    expect(entry).toMatchObject({scope:"cron.run",job:"email-outbox",durationMs:expect.any(Number),result:"completed",skipped:false,counts:{processed:2,purchases:{sent:2,failed:0}}})
    expect(JSON.stringify(entry)).not.toContain("private")
    expect(JSON.stringify(entry)).not.toContain("sensitive")
    expect(JSON.stringify(entry)).not.toContain("local-test-cron-secret")
  })
  it("rejects invalid Bold signature without DB or business effects",async()=>{
    const response=await boldWebhook(new Request("https://app.test/api/webhooks/bold",{method:"POST",headers:{"content-type":"application/json","x-bold-signature":"invalid"},body:"{}"}))
    expect(response.status).toBe(401)
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it("rejects a large unsigned body even without a Content-Length header",async()=>{
    const response=await boldWebhook(new Request("https://app.test",{method:"POST",headers:{"content-type":"application/json"},body:"x".repeat(65537)}))
    expect(response.status).toBe(413)
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it("durably receives the same signed notification twice without sending email",async()=>{
    const raw=JSON.stringify({id:"evt-1",type:"SALE_APPROVED",subject:"tx-1",data:{payment_id:"tx-1",amount:{total:100,currency:"COP"},metadata:{reference:"SZ-test"},payer_email:"private@example.test"}})
    const signature=createHmac("sha256","local-bold-secret").update(Buffer.from(raw).toString("base64")).digest("hex")
    for(let i=0;i<2;i++){
      const response=await boldWebhook(new Request("https://app.test",{method:"POST",headers:{"content-type":"application/json","x-bold-signature":signature},body:raw}))
      expect(response.status).toBe(200)
    }
    expect(mock.rpc).toHaveBeenCalledTimes(2)
    expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1])
    expect(mock.rpc.mock.calls[0][0]).toBe("receive_payment_notification")
    expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain("private")
    expect(mock.send).not.toHaveBeenCalled()
  })
  it("fails receipt rather than acknowledging an event lost by storage",async()=>{
    mock.rpc.mockResolvedValue({data:null,error:{message:"database unavailable"}})
    const raw=JSON.stringify({id:"e",type:"SALE_APPROVED",data:{payment_id:"t",amount:{total:100,currency:"COP"},metadata:{reference:"SZ-test"}}})
    const signature=createHmac("sha256","local-bold-secret").update(Buffer.from(raw).toString("base64")).digest("hex")
    expect((await boldWebhook(new Request("https://app.test",{method:"POST",headers:{"content-type":"application/json","x-bold-signature":signature},body:raw}))).status).toBe(503)
  })
  it("claims outbox atomically and uses the stable provider key after retry",async()=>{
    mock.rpc.mockImplementation(async(name:string)=>({data:name==="claim_email_outbox" ? [{id:"email-1",order_id:"order-1",delivery_version:1}] : true,error:null}))
    const chain={select:vi.fn(),eq:vi.fn(),single:vi.fn()}
    chain.select.mockReturnValue(chain);chain.eq.mockReturnValue(chain)
    chain.single.mockResolvedValue({data:{id:"order-1",status:"approved",reference:"SZ-test",created_at:"2026-09-02",customer_name_snapshot:"Test",customer_email_snapshot:"test@example.test",items:[],discount_lines:[],total:100,subtotal:100},error:null})
    mock.from.mockReturnValue(chain)
    mock.send.mockResolvedValueOnce(null).mockResolvedValueOnce({id:"provider-email"})
    expect(await processEmailOutboxBatch()).toMatchObject({failed:1,sent:0})
    expect(await processEmailOutboxBatch()).toMatchObject({failed:0,sent:1})
    expect(mock.send.mock.calls[0][0].idempotencyKey).toBe("purchase/email-1/v1")
    expect(mock.send.mock.calls[1][0].idempotencyKey).toBe("purchase/email-1/v1")
    expect(mock.rpc).toHaveBeenCalledWith("finish_email_outbox",expect.objectContaining({p_id:"email-1",p_sent:true,p_token:expect.any(String),p_delivery_version:1}))
  })
  it("does not count sent when the lease no longer belongs to worker",async()=>{
    mock.rpc.mockImplementation(async(name:string)=>({data:name==="claim_email_outbox" ? [{id:"email-1",order_id:"order-1",delivery_version:1}] : false,error:null}))
    const chain={select:vi.fn(),eq:vi.fn(),single:vi.fn()}
    chain.select.mockReturnValue(chain);chain.eq.mockReturnValue(chain)
    chain.single.mockResolvedValue({data:{status:"approved",reference:"SZ-test",created_at:"2026-09-02",customer_email_snapshot:"test@example.test",items:[],discount_lines:[],total:100,subtotal:100},error:null})
    mock.from.mockReturnValue(chain);mock.send.mockResolvedValue({id:"sent"})
    expect(await processEmailOutboxBatch()).toEqual({processed:1,sent:0,failed:1})
  })
})

describe("SQL contract - static evidence only, not a staging execution",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/20260902000200_atomic_payments_bold.sql",import.meta.url),"utf8")
  it("serializes checkout and protects duplicate keys",()=>{
    expect(sql).toContain("pg_advisory_xact_lock")
    expect(sql).toContain("PRIMARY KEY(user_id, cart_hash)")
    expect(sql).toContain("IF v_total=0 THEN PERFORM public.apply_approved_order_effects(o.id)")
  })
  it("checks live course availability and administrative blocks before order reuse",()=>{
    const checkout=sql.split("CREATE FUNCTION public.create_checkout_order")[1].split("CREATE FUNCTION public.get_payable_checkout_order")[0]
    expect(checkout.indexOf("c.is_published")).toBeLessThan(checkout.indexOf("SELECT ord.* INTO o"))
    expect(checkout.indexOf("Access administratively blocked")).toBeLessThan(checkout.indexOf("SELECT ord.* INTO o"))
    const payable=sql.split("CREATE FUNCTION public.get_payable_checkout_order")[1].split("CREATE FUNCTION public.apply_payment_event")[0]
    expect(payable).toContain("enrollment_blocks")
    expect(payable).toContain("NOT c.is_published")
    expect(payable).toContain("user_id=p_user_id FOR UPDATE")
  })
  it("acquires student entitlement lock before order row locks across writers",()=>{
    for(const name of ["apply_approved_order_effects","create_checkout_order","get_payable_checkout_order","apply_payment_event","enqueue_purchase_email","record_order_reversal"]){
      const body=sql.split(`CREATE FUNCTION public.${name}`)[1].split("END $$")[0]
      expect(body.indexOf("pg_advisory_xact_lock"),name).toBeGreaterThanOrEqual(0)
      expect(body.indexOf("pg_advisory_xact_lock"),name).toBeLessThan(body.indexOf("FOR UPDATE"))
    }
  })
  it("dedup + transition + approval effects are inside a row-locked function",()=>{
    const apply=sql.split("CREATE FUNCTION public.apply_payment_event")[1].split("CREATE FUNCTION public.receive_payment_notification")[0]
    expect(apply).toContain("FOR UPDATE")
    expect(apply).toContain("ON CONFLICT(payload_hash) DO NOTHING")
    expect(apply).toContain("public.apply_approved_order_effects(o.id)")
    expect(apply).toContain("stale_event")
    expect(apply).toContain("order_mismatch")
  })
  it("uses SKIP LOCKED, leases, bounded attempts and stops ambiguous sends after provider retention",()=>{
    expect(sql).toContain("FOR UPDATE SKIP LOCKED")
    expect(sql).toContain("delivery_started_at<now()-interval '23 hours'")
    expect(sql).toContain("WHERE id=p_id AND lease_token=p_token")
    expect(sql).toContain("AND leased_until>now() AND delivery_version=p_delivery_version")
    expect(sql).toContain("sent_at=NULL,lease_token=NULL,leased_until=NULL")
    expect(sql).toContain("attempts>=5")
  })
  it("restricts every payment function and table to service role with invoker semantics",()=>{
    expect(sql).not.toContain("SECURITY DEFINER")
    expect(sql).toContain("FROM PUBLIC,anon,authenticated")
    expect(sql).toContain("TO service_role")
    expect(sql).toContain("payment_notification_inbox ENABLE ROW LEVEL SECURITY")
  })
  it("guards stored financial and line snapshots from rewriting",()=>{
    expect(sql).toContain("Immutable order financial snapshot")
    expect(sql).toContain("Immutable order line snapshot")
    expect(sql).toContain("orders_provider_transaction_unique")
  })
  it("retains settled paid ownership during temporary suspension while respecting permanent blocks",()=>{
    const effects=sql.split("CREATE FUNCTION public.apply_approved_order_effects")[1].split("CREATE FUNCTION public.enroll_native_free_course")[0]
    expect(effects).toContain("p.deleted_at IS NULL")
    expect(effects).not.toContain("suspended_at IS NULL")
    expect(effects).toContain("public.enrollment_blocks")
  })
})
