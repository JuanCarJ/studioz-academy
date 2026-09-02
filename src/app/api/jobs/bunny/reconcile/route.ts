import { runCronJob } from "@/lib/cron"

import {
  reconcilePendingBunnyAssets,
  revalidateTouchedCoursePaths,
} from "@/lib/bunny"

export const maxDuration = 60
export async function GET(request: Request) {
  return runCronJob(request, "bunny-reconcile", async () => {
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

  return {
    ok: true,
    ...result,
    timestamp: new Date().toISOString(),
  }
  })
}

export const POST = GET
