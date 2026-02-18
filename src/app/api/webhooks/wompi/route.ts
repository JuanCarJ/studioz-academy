import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  // TODO: Verify HMAC signature with WOMPI_EVENTS_SECRET
  // TODO: Parse event, update order status in Supabase
  const body = await request.json()
  console.log("Wompi webhook received:", body)

  return NextResponse.json({ received: true })
}
