import { NextRequest, NextResponse } from "next/server"

import {
  reconcilePendingBunnyAssets,
  revalidateTouchedCoursePaths,
} from "@/lib/bunny"

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await reconcilePendingBunnyAssets({
    source: "cron",
    force: true,
  })
  revalidateTouchedCoursePaths(result.touchedCourses)

  console.info("[bunny-media]", {
    event: "cron_reconcile_completed",
    source: "cron",
    reconciled: result.reconciled,
    previewUpdates: result.previewUpdates,
    lessonUpdates: result.lessonUpdates,
    errors: result.errors,
    touchedCourseIds: result.touchedCourses.map((course) => course.id),
  })

  return NextResponse.json({
    ok: true,
    ...result,
    timestamp: new Date().toISOString(),
  })
}
