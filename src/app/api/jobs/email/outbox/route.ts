import { runCronJob } from "@/lib/cron"
import { processEmailOutboxBatch } from "@/lib/email-outbox"
import { processCourseNotificationBatch } from "@/lib/course-notifications"
export const maxDuration = 60
export async function GET(request: Request) {
  return runCronJob(request, "email-outbox", async () => {
    const [purchases, courses] = await Promise.allSettled([processEmailOutboxBatch(), processCourseNotificationBatch()])
    // Keep the shared lease until both workers have settled, including failures.
    if (purchases.status === "rejected" || courses.status === "rejected") throw new Error("Email worker failed")
    return { purchases: purchases.value, courses: courses.value }
  })
}
export const POST = GET
