import "server-only"
import { randomUUID } from "node:crypto"
import { createServiceRoleClient } from "@/lib/supabase/admin"
import { sendEmail } from "@/lib/resend"
import { env } from "@/lib/env"
import { NewCourseNotification } from "@/emails/NewCourseNotification"
import type { Json } from "@/types/database"

type NotificationRpc = "schedule_course_notification" | "materialize_course_notification_batch"
  | "claim_course_notifications" | "finish_course_notification" | "course_notification_stats"
// Local migration contract; regenerate global Database types only on an
// authorized staging introspection. This adapter never widens other RPC names.
async function notificationRpc<T>(name: NotificationRpc, args: Record<string, Json>): Promise<T> {
  const client = createServiceRoleClient()
  const rpc = client.rpc.bind(client) as unknown as (
    name: NotificationRpc, args: Record<string, Json>
  ) => Promise<{ data: T | null; error: unknown }>
  const { data, error } = await rpc(name, args)
  if (error || data === null) throw new Error(`Notification operation failed: ${name}`)
  return data
}

export interface CourseNotificationStats {
  id: string; kind: "course" | "lesson"; description: string; audience_complete: boolean
  scheduled: number; sent: number; skipped: number; failed: number; pending: number
}
export async function getCourseNotificationStats(courseId: string) {
  return notificationRpc<CourseNotificationStats[]>("course_notification_stats", { p_course_id: courseId })
}
export async function scheduleCourseNotification(actorId: string, courseId: string, lessonId?: string) {
  return notificationRpc<string>("schedule_course_notification", {
    p_actor_id: actorId, p_course_id: courseId, p_app_url: env.APP_URL(), p_lesson_id: lessonId ?? null,
  })
}
interface ClaimedNotification {
  id: string; recipient_email: string | null; kind: "course" | "lesson"; course_title: string
  description: string; course_url: string; preferences_url: string; eligible: boolean; retry_expired: boolean
}

/** At most 100 audience rows and 3 sends; each provider call times out at 8s. */
export async function processCourseNotificationBatch(): Promise<Record<string, number>> {
  const scheduled = await notificationRpc<number>("materialize_course_notification_batch", { p_limit: 100 })
  const token = randomUUID()
  const entries = await notificationRpc<ClaimedNotification[]>("claim_course_notifications", { p_limit: 3, p_token: token })
  let sent = 0; let skipped = 0; let failed = 0
  for (const entry of entries) {
    let result: "sent" | "skipped" | "failed" | "expired" = "failed"
    let providerId: string | null = null
    if (entry.retry_expired) result = "expired"
    else if (!entry.eligible || !entry.recipient_email) result = "skipped"
    else {
      try {
        const accepted = await sendEmail({
          to: entry.recipient_email,
          subject: `${entry.kind === "lesson" ? "Nueva leccion" : "Nuevo curso"}: ${entry.course_title}`,
          react: NewCourseNotification({
            courseTitle: entry.course_title, courseDescription: entry.description,
            courseUrl: entry.course_url, preferencesUrl: entry.preferences_url, kind: entry.kind,
          }),
          // Same immutable campaign/recipient snapshot across all retry attempts.
          idempotencyKey: `course-notification/${entry.id}`,
        })
        if (accepted) { result = "sent"; providerId = accepted.id }
      } catch { /* Ambiguous acceptance retries use the same key within 23 hours. */ }
    }
    const finished = await notificationRpc<boolean>("finish_course_notification", {
      p_id: entry.id, p_token: token, p_result: result, p_provider_id: providerId,
    })
    if (!finished || result === "failed" || result === "expired") failed++
    else if (result === "sent") sent++
    else skipped++
  }
  return { scheduled, processed: entries.length, sent, skipped, failed }
}
