import { beforeEach, expect, it, vi } from "vitest"
const mock=vi.hoisted(()=>({user:vi.fn(),rpc:vi.fn(),from:vi.fn()}))
vi.mock("@/lib/supabase/auth",()=>({getCurrentUser:mock.user}))
vi.mock("@/lib/supabase/admin",()=>({createServiceRoleClient:()=>({rpc:mock.rpc,from:mock.from})}))
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}))
import { reconcileOrderAdmin, recordConfirmedReversal } from "@/actions/admin/payment-operations"
beforeEach(()=>{mock.user.mockResolvedValue({id:"admin-1",role:"admin"});mock.rpc.mockResolvedValue({data:{applied:true},error:null})})
it("admin reconciliation rejects ordinary users before any DB/provider access",async()=>{
  mock.user.mockResolvedValue({id:"user-1",role:"user"})
  expect((await reconcileOrderAdmin("order-1")).success).toBe(false)
  expect(mock.from).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})
it("requires explicit external confirmation and usable evidence",async()=>{
  expect((await recordConfirmedReversal({orderId:"order-1",status:"refunded",evidence:"BANK-123456",confirmed:false})).success).toBe(false)
  expect((await recordConfirmedReversal({orderId:"order-1",status:"refunded",evidence:"",confirmed:true})).success).toBe(false)
  expect(mock.rpc).not.toHaveBeenCalled()
})
it("records confirmed evidence in one RPC and never initiates a payout",async()=>{
  expect(await recordConfirmedReversal({orderId:"order-1",status:"refunded",evidence:"BANK-123456",confirmed:true})).toEqual({success:true,applied:true})
  expect(mock.rpc).toHaveBeenCalledWith("record_order_reversal",{p_order_id:"order-1",p_actor_id:"admin-1",p_status:"refunded",p_evidence:"BANK-123456"})
  expect(fetch).not.toHaveBeenCalled()
})
it("reports failed transactions honestly",async()=>{
  mock.rpc.mockResolvedValue({data:null,error:{message:"failure"}})
  expect((await recordConfirmedReversal({orderId:"order-1",status:"chargeback",evidence:"BANK-123456",confirmed:true})).success).toBe(false)
})
