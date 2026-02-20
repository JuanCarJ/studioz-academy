import { NextRequest, NextResponse } from "next/server"

import { processEmailOutboxBatch } from "@/actions/email"

export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await processEmailOutboxBatch()

  return NextResponse.json({
    ok: true,
    ...result,
    timestamp: new Date().toISOString(),
  })
}
