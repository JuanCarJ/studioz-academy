import { NextRequest, NextResponse } from "next/server"

import { reconcilePendingOrders } from "@/actions/payments"

export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await reconcilePendingOrders()

  return NextResponse.json({
    ok: true,
    reconciled: result.reconciled,
    timestamp: new Date().toISOString(),
  })
}
