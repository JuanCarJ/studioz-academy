import { NextResponse } from "next/server"

export async function POST() {
  // TODO: Query pending orders older than 15 min
  // TODO: Check status with Wompi API
  // TODO: Update order status in Supabase
  console.log("Payment reconciliation job triggered")

  return NextResponse.json({ reconciled: 0 })
}
