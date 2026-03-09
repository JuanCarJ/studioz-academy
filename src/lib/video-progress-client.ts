export type VideoProgressFlushReason = "pause" | "logout" | "pagehide"

export interface VideoProgressFlushPayload {
  courseId: string
  lessonId: string
  position: number
  reason: VideoProgressFlushReason
  csrfToken: string
}

type ActiveProgressFlushHandler = () => Promise<void>

let activeProgressFlushHandler: ActiveProgressFlushHandler | null = null

function buildFlushFormData(payload: VideoProgressFlushPayload) {
  const formData = new FormData()
  formData.set("courseId", payload.courseId)
  formData.set("lessonId", payload.lessonId)
  formData.set("position", String(Math.floor(payload.position)))
  formData.set("reason", payload.reason)
  formData.set("csrfToken", payload.csrfToken)
  return formData
}

export function registerActiveVideoProgressFlushHandler(
  handler: ActiveProgressFlushHandler
) {
  activeProgressFlushHandler = handler

  return () => {
    if (activeProgressFlushHandler === handler) {
      activeProgressFlushHandler = null
    }
  }
}

export async function flushActiveVideoProgress() {
  if (!activeProgressFlushHandler) return
  await activeProgressFlushHandler()
}

export async function postVideoProgressFlush(
  payload: VideoProgressFlushPayload,
  options?: { keepalive?: boolean }
) {
  const response = await fetch("/api/progress/video-position/flush", {
    method: "POST",
    body: buildFlushFormData(payload),
    credentials: "include",
    cache: "no-store",
    keepalive: options?.keepalive ?? false,
  })

  if (!response.ok) {
    throw new Error(`Flush failed with status ${response.status}`)
  }
}

export function sendVideoProgressFlushBeacon(payload: VideoProgressFlushPayload) {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return false
  }

  return navigator.sendBeacon(
    "/api/progress/video-position/flush",
    buildFlushFormData(payload)
  )
}
