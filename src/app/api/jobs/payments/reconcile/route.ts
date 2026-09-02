import { runCronJob } from "@/lib/cron"
import { reconcilePendingOrders } from "@/lib/payment-reconciliation"
export const maxDuration = 60
export async function GET(request: Request) { return runCronJob(request, "payments-reconcile", reconcilePendingOrders) }
export const POST = GET
