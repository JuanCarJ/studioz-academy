import { createHash } from "crypto"
import { revalidatePath } from "next/cache"

import { env } from "@/lib/env"
import { createServiceRoleClient } from "@/lib/supabase/admin"

import type { BunnyUploadSession, Course, Lesson } from "@/types"

const BUNNY_API_BASE_URL = "https://video.bunnycdn.com"
const BUNNY_TUS_ENDPOINT = `${BUNNY_API_BASE_URL}/tusupload`
const DEFAULT_TUS_SESSION_TTL_SECONDS = 60 * 60
const DEFAULT_BUNNY_CHECK_THROTTLE_MS = 30_000
const PROCESSING_WARNING_THRESHOLD_MS = 30 * 60_000
const STALE_CHECK_WARNING_THRESHOLD_MS = 2 * 60_000

interface BunnyVideoCreateResponse {
  guid: string
}

export type BunnyProcessingState = "processing" | "ready" | "error" | "missing"

export interface ResolvedCoursePreview {
  kind: "ready" | "processing" | "error" | "legacy" | "none"
  url: string | null
  message: string | null
  isPlayable: boolean
  videoId: string | null
}

export interface ResolvedLessonAssetState {
  state: BunnyProcessingState
  message: string | null
  isPlayable: boolean
  videoId: string | null
}

export interface BunnyReconcileResult {
  reconciled: number
  previewUpdates: number
  lessonUpdates: number
  errors: number
  touchedCourses: Array<{ id: string; slug: string }>
}

export type BunnyFreshnessSource =
  | "admin_page"
  | "public_page"
  | "dashboard_page"
  | "lesson_playback"
  | "webhook"
  | "cron"

export interface EnsureCourseMediaFreshOptions {
  source: BunnyFreshnessSource
  throttleMs?: number
}

interface CoursePreviewRow {
  id: string
  slug: string
  preview_video_url: string | null
  preview_bunny_video_id: string | null
  preview_bunny_library_id: string | null
  preview_status: "none" | "legacy" | "processing" | "ready" | "error"
  preview_last_checked_at: string | null
  preview_last_state_changed_at: string | null
  pending_preview_bunny_video_id: string | null
  pending_preview_bunny_library_id: string | null
  pending_preview_status: "none" | "processing" | "ready" | "error"
  preview_upload_error: string | null
}

interface LessonMediaRow {
  id: string
  course_id: string
  bunny_video_id: string
  bunny_library_id: string
  bunny_status: "processing" | "ready" | "error"
  bunny_last_checked_at: string | null
  bunny_last_state_changed_at: string | null
  pending_bunny_video_id: string | null
  pending_bunny_library_id: string | null
  pending_bunny_status: "none" | "processing" | "ready" | "error"
  video_upload_error: string | null
  duration_seconds: number
  courses: { id: string; slug: string } | { id: string; slug: string }[]
}

interface BunnyRemoteState {
  state: BunnyProcessingState
  length: number
  message: string | null
  requestFailed: boolean
}

function buildBunnyApiUrl(pathname: string): string {
  return `${BUNNY_API_BASE_URL}/library/${env.BUNNY_LIBRARY_ID()}${pathname}`
}

function buildBunnyHeaders(headers?: HeadersInit): Headers {
  const finalHeaders = new Headers(headers)
  finalHeaders.set("AccessKey", env.BUNNY_API_KEY())
  return finalHeaders
}

/**
 * Generate a signed iframe embed URL for Bunny Stream video playback.
 *
 * Token authentication:
 * - token = SHA256(securityKey + videoId + expirationEpoch)
 * - URL = https://iframe.mediadelivery.net/embed/<libraryId>/<videoId>?token=<token>&expires=<epoch>
 *
 * Bunny's current embed token authentication signs the iframe URL with the
 * token security key, the video ID and the expiration timestamp.
 */
export function generateSignedUrl(
  videoId: string,
  expiresInSeconds = 21600
): string {
  const libraryId = env.BUNNY_LIBRARY_ID()
  const securityKey = env.BUNNY_TOKEN_AUTH_KEY()

  const expirationEpoch = Math.floor(Date.now() / 1000) + expiresInSeconds

  const token = createHash("sha256")
    .update(securityKey + videoId + expirationEpoch)
    .digest("hex")

  return `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?token=${token}&expires=${expirationEpoch}`
}

/**
 * Create a video entry in Bunny Stream and return its GUID.
 */
export async function createBunnyVideo(title: string): Promise<string> {
  const res = await fetch(buildBunnyApiUrl("/videos"), {
    method: "POST",
    headers: buildBunnyHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ title }),
  })

  if (!res.ok) {
    throw new Error(`Bunny: Failed to create video entry (${res.status})`)
  }

  const { guid } = (await res.json()) as BunnyVideoCreateResponse

  return guid
}

/**
 * Create a short-lived TUS upload session for a previously created Bunny video.
 * The browser uploads bytes directly to Bunny using these credentials.
 */
export function createBunnyTusUploadSession(
  videoId: string,
  expiresInSeconds = DEFAULT_TUS_SESSION_TTL_SECONDS
): BunnyUploadSession {
  const libraryId = env.BUNNY_LIBRARY_ID()
  const apiKey = env.BUNNY_API_KEY()
  const expirationTime =
    Math.floor(Date.now() / 1000) + Math.max(60, expiresInSeconds)

  const signature = createHash("sha256")
    .update(`${libraryId}${apiKey}${expirationTime}${videoId}`)
    .digest("hex")

  return {
    videoId,
    libraryId,
    expirationTime,
    signature,
    tusEndpoint: BUNNY_TUS_ENDPOINT,
  }
}

/**
 * Delete a video from Bunny Stream library.
 * Silently succeeds if the video does not exist (404 is ignored).
 */
export async function deleteBunnyVideo(videoId: string): Promise<void> {
  const res = await fetch(buildBunnyApiUrl(`/videos/${videoId}`), {
    method: "DELETE",
    headers: buildBunnyHeaders(),
  })

  if (!res.ok && res.status !== 404) {
    throw new Error(`Bunny: Failed to delete video ${videoId} (${res.status})`)
  }
}

/**
 * Get the processing status and duration of a video in Bunny Stream.
 *
 * Status codes (from Bunny docs):
 *   0 = Created, 1 = Uploaded, 2 = Processing, 3 = Transcoding,
 *   4 = Finished, 5 = Error, 6 = UploadFailed
 */
export async function getVideoStatus(
  videoId: string
): Promise<{ status: number; length: number; encodeProgress: number }> {
  const status = await getVideoStatusOrNull(videoId)

  if (!status) {
    throw new Error(`Bunny: Failed to get video status (404)`)
  }

  return status
}

export async function getVideoStatusOrNull(
  videoId: string
): Promise<{ status: number; length: number; encodeProgress: number } | null> {
  const res = await fetch(buildBunnyApiUrl(`/videos/${videoId}`), {
    method: "GET",
    headers: buildBunnyHeaders(),
  })

  if (res.status === 404) {
    return null
  }

  if (!res.ok) {
    throw new Error(`Bunny: Failed to get video status (${res.status})`)
  }

  const data = (await res.json()) as {
    status: number
    length: number
    encodeProgress?: number
  }
  return {
    status: data.status,
    length: data.length,
    encodeProgress: data.encodeProgress ?? 0,
  }
}

export function resolveBunnyStatusCode(
  status: number | null | undefined
): BunnyProcessingState {
  if (status == null) return "missing"
  if (status === 4) return "ready"
  if (status === 5 || status === 6) return "error"
  return "processing"
}

export function getLessonStateMessage(
  state: BunnyProcessingState,
  fallbackError?: string | null
): string | null {
  if (state === "ready") return null
  if (state === "processing") {
    return "Este video todavia se esta procesando en Bunny."
  }
  if (state === "missing") {
    return "El video no esta disponible en Bunny en este momento."
  }
  return fallbackError ?? "Bunny reporto un error al procesar este video."
}

export function resolveLessonAssetState(
  lesson:
    | Pick<Lesson, "bunny_video_id" | "bunny_status" | "video_upload_error">
    | {
        bunny_video_id: string
        bunny_status: string
        video_upload_error: string | null
      }
): ResolvedLessonAssetState {
  const state =
    lesson.bunny_status === "ready"
      ? "ready"
      : lesson.bunny_status === "error"
        ? "error"
        : "processing"

  return {
    state,
    message: getLessonStateMessage(state, lesson.video_upload_error),
    isPlayable: state === "ready",
    videoId: lesson.bunny_video_id ?? null,
  }
}

export function resolveCoursePreview(
  course: Pick<
    Course,
    | "preview_video_url"
    | "preview_bunny_video_id"
    | "preview_status"
    | "preview_upload_error"
  >
): ResolvedCoursePreview {
  if (course.preview_bunny_video_id && course.preview_status === "ready") {
    return {
      kind: "ready",
      url: generateSignedUrl(course.preview_bunny_video_id),
      message: null,
      isPlayable: true,
      videoId: course.preview_bunny_video_id,
    }
  }

  if (course.preview_video_url) {
    return {
      kind: "legacy",
      url: course.preview_video_url,
      message: null,
      isPlayable: true,
      videoId: null,
    }
  }

  if (course.preview_bunny_video_id && course.preview_status === "error") {
    return {
      kind: "error",
      url: null,
      message:
        course.preview_upload_error ??
        "La vista previa no esta disponible porque Bunny reporto un error.",
      isPlayable: false,
      videoId: course.preview_bunny_video_id,
    }
  }

  if (course.preview_bunny_video_id && course.preview_status === "processing") {
    return {
      kind: "processing",
      url: null,
      message: "La vista previa se esta procesando en Bunny.",
      isPlayable: false,
      videoId: course.preview_bunny_video_id,
    }
  }

  return {
    kind: "none",
    url: null,
    message: null,
    isPlayable: false,
    videoId: null,
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return "Unknown error"
}

function logBunnyMedia(
  level: "info" | "warn" | "error",
  event: string,
  payload: Record<string, unknown>
) {
  console[level]("[bunny-media]", { event, ...payload })
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function getElapsedMs(value: string | null | undefined, nowMs: number): number | null {
  const timestamp = parseTimestamp(value)
  if (timestamp == null) return null
  return Math.max(0, nowMs - timestamp)
}

function shouldSkipRemoteCheck(input: {
  hasRelevantMedia: boolean
  lastCheckedAt: string | null
  throttleMs: number
  force: boolean
}): boolean {
  if (!input.hasRelevantMedia || input.force) {
    return false
  }

  const elapsedMs = getElapsedMs(input.lastCheckedAt, Date.now())
  return elapsedMs != null && elapsedMs < input.throttleMs
}

function shouldWarnForStaleChecks(input: {
  lastCheckedAt: string | null
  throttleMs: number
  force: boolean
}) {
  if (input.force) return false

  const elapsedMs = getElapsedMs(input.lastCheckedAt, Date.now())
  if (elapsedMs == null) return false

  return elapsedMs >= Math.max(STALE_CHECK_WARNING_THRESHOLD_MS, input.throttleMs * 2)
}

function isCoursePreviewCheckRelevant(course: CoursePreviewRow): boolean {
  return (
    !!course.pending_preview_bunny_video_id ||
    (!!course.preview_bunny_video_id && course.preview_status !== "ready")
  )
}

function isLessonCheckRelevant(lesson: LessonMediaRow): boolean {
  return !!lesson.pending_bunny_video_id || lesson.bunny_status !== "ready"
}

function warnIfProcessingLooksStuck(input: {
  kind: "preview" | "lesson"
  courseId: string
  slug: string
  videoId: string | null
  stateChangedAt: string | null
  source: BunnyFreshnessSource
}) {
  const elapsedMs = getElapsedMs(input.stateChangedAt, Date.now())
  if (elapsedMs == null || elapsedMs < PROCESSING_WARNING_THRESHOLD_MS) {
    return
  }

  logBunnyMedia("warn", "processing_stuck", {
    source: input.source,
    kind: input.kind,
    courseId: input.courseId,
    slug: input.slug,
    videoId: input.videoId,
    processingForMs: elapsedMs,
  })
}

function warnIfChecksAreStale(input: {
  kind: "preview" | "lesson"
  courseId: string
  slug: string
  lastCheckedAt: string | null
  source: BunnyFreshnessSource
  throttleMs: number
  force: boolean
}) {
  if (
    !shouldWarnForStaleChecks({
      lastCheckedAt: input.lastCheckedAt,
      throttleMs: input.throttleMs,
      force: input.force,
    })
  ) {
    return
  }

  const elapsedMs = getElapsedMs(input.lastCheckedAt, Date.now())
  logBunnyMedia("warn", "last_check_stale", {
    source: input.source,
    kind: input.kind,
    courseId: input.courseId,
    slug: input.slug,
    lastCheckedAt: input.lastCheckedAt,
    lastCheckedAgoMs: elapsedMs,
    expectedSlaMs: Math.max(STALE_CHECK_WARNING_THRESHOLD_MS, input.throttleMs * 2),
  })
}

function addTouchedCourse(
  touchedCourses: Map<string, { id: string; slug: string }>,
  courseId: string,
  slug: string
) {
  touchedCourses.set(courseId, { id: courseId, slug })
}

export function revalidateTouchedCoursePaths(
  touchedCourses: Array<{ id: string; slug: string }>
) {
  if (touchedCourses.length === 0) {
    return
  }

  revalidatePath("/admin/cursos")
  revalidatePath("/cursos")

  for (const course of touchedCourses) {
    revalidatePath(`/admin/cursos/${course.id}/editar`)
    revalidatePath(`/cursos/${course.slug}`)
    revalidatePath(`/dashboard/cursos/${course.slug}`)
  }
}

async function readRemoteBunnyState(videoId: string): Promise<BunnyRemoteState> {
  try {
    const remote = await getVideoStatusOrNull(videoId)
    if (!remote) {
      return {
        state: "missing",
        length: 0,
        message: "El video ya no existe en Bunny.",
        requestFailed: false,
      }
    }

    const state = resolveBunnyStatusCode(remote.status)
    return {
      state,
      length: remote.length,
      message: getLessonStateMessage(state, null),
      requestFailed: false,
    }
  } catch (error) {
    logBunnyMedia("error", "remote_check_failed", {
      videoId,
      error: getErrorMessage(error),
    })

    return {
      state: "error",
      length: 0,
      message: "No se pudo consultar el estado del video en Bunny.",
      requestFailed: true,
    }
  }
}

export async function reconcilePendingBunnyAssets(options?: {
  courseId?: string
  source?: BunnyFreshnessSource
  throttleMs?: number
  force?: boolean
}): Promise<BunnyReconcileResult> {
  const supabase = createServiceRoleClient()
  const touchedCourses = new Map<string, { id: string; slug: string }>()
  const source = options?.source ?? "cron"
  const throttleMs = Math.max(1_000, options?.throttleMs ?? DEFAULT_BUNNY_CHECK_THROTTLE_MS)
  const force = options?.force ?? (source === "cron" || source === "webhook")
  const nowIso = new Date().toISOString()
  let previewUpdates = 0
  let lessonUpdates = 0
  let errors = 0

  let courseQuery = supabase
    .from("courses")
    .select(
      [
        "id",
        "slug",
        "preview_video_url",
        "preview_bunny_video_id",
        "preview_bunny_library_id",
        "preview_status",
        "preview_last_checked_at",
        "preview_last_state_changed_at",
        "pending_preview_bunny_video_id",
        "pending_preview_bunny_library_id",
        "pending_preview_status",
        "preview_upload_error",
      ].join(", ")
    )

  if (options?.courseId) {
    courseQuery = courseQuery.eq("id", options.courseId)
  } else {
    courseQuery = courseQuery.or(
      "pending_preview_bunny_video_id.not.is.null,preview_status.eq.processing,preview_status.eq.error,pending_preview_status.eq.processing,pending_preview_status.eq.error"
    )
  }

  const { data: courseRows } = await courseQuery
  const courses = ((courseRows ?? []) as unknown) as CoursePreviewRow[]

  for (const course of courses) {
    warnIfChecksAreStale({
      kind: "preview",
      courseId: course.id,
      slug: course.slug,
      lastCheckedAt: course.preview_last_checked_at,
      source,
      throttleMs,
      force,
    })

    if (course.pending_preview_status === "processing") {
      warnIfProcessingLooksStuck({
        kind: "preview",
        courseId: course.id,
        slug: course.slug,
        videoId:
          course.pending_preview_bunny_video_id ?? course.preview_bunny_video_id,
        stateChangedAt: course.preview_last_state_changed_at,
        source,
      })
    } else if (course.preview_status === "processing") {
      warnIfProcessingLooksStuck({
        kind: "preview",
        courseId: course.id,
        slug: course.slug,
        videoId: course.preview_bunny_video_id,
        stateChangedAt: course.preview_last_state_changed_at,
        source,
      })
    }

    if (
      course.pending_preview_bunny_video_id &&
      course.pending_preview_bunny_library_id
    ) {
      if (
        shouldSkipRemoteCheck({
          hasRelevantMedia: true,
          lastCheckedAt: course.preview_last_checked_at,
          throttleMs,
          force,
        })
      ) {
        continue
      }

      const pendingState = await readRemoteBunnyState(
        course.pending_preview_bunny_video_id
      )
      const updateData: Record<string, unknown> = {
        preview_last_checked_at: nowIso,
      }

      if (pendingState.requestFailed) {
        await supabase.from("courses").update(updateData).eq("id", course.id)
        errors++
        continue
      }

      if (pendingState.state === "ready") {
        const oldVideoId = course.preview_bunny_video_id

        updateData.preview_bunny_video_id = course.pending_preview_bunny_video_id
        updateData.preview_bunny_library_id = course.pending_preview_bunny_library_id
        updateData.preview_status = "ready"
        updateData.preview_video_url = null
        updateData.pending_preview_bunny_video_id = null
        updateData.pending_preview_bunny_library_id = null
        updateData.pending_preview_status = "none"
        updateData.preview_upload_error = null
        updateData.preview_last_state_changed_at = nowIso

        await supabase.from("courses").update(updateData).eq("id", course.id)

        if (oldVideoId && oldVideoId !== course.pending_preview_bunny_video_id) {
          await deleteBunnyVideo(oldVideoId).catch(() => undefined)
        }

        previewUpdates++
        addTouchedCourse(touchedCourses, course.id, course.slug)
        continue
      }

      if (pendingState.state === "processing") {
        let shouldTouch = false

        if (course.pending_preview_status !== "processing") {
          updateData.pending_preview_status = "processing"
          updateData.preview_last_state_changed_at = nowIso
          shouldTouch = true
        }

        if (course.preview_upload_error) {
          updateData.preview_upload_error = null
          shouldTouch = true
        }

        await supabase.from("courses").update(updateData).eq("id", course.id)

        if (shouldTouch) {
          previewUpdates++
          addTouchedCourse(touchedCourses, course.id, course.slug)
        }
        continue
      }

      let shouldTouch = false

      if (course.pending_preview_status !== "error") {
        updateData.pending_preview_status = "error"
        updateData.preview_last_state_changed_at = nowIso
        shouldTouch = true
      }

      const nextMessage =
        pendingState.message ??
        "No se pudo procesar la nueva vista previa en Bunny."
      if (course.preview_upload_error !== nextMessage) {
        updateData.preview_upload_error = nextMessage
        shouldTouch = true
      }

      await supabase.from("courses").update(updateData).eq("id", course.id)

      if (shouldTouch) {
        previewUpdates++
        addTouchedCourse(touchedCourses, course.id, course.slug)
      }
      errors++
      continue
    }

    if (course.preview_bunny_video_id) {
      if (
        shouldSkipRemoteCheck({
          hasRelevantMedia: isCoursePreviewCheckRelevant(course),
          lastCheckedAt: course.preview_last_checked_at,
          throttleMs,
          force,
        })
      ) {
        continue
      }

      const activeState = await readRemoteBunnyState(course.preview_bunny_video_id)
      const updateData: Record<string, unknown> = {
        preview_last_checked_at: nowIso,
      }

      if (activeState.requestFailed) {
        await supabase.from("courses").update(updateData).eq("id", course.id)
        errors++
        continue
      }

      const nextStatus =
        activeState.state === "ready"
          ? "ready"
          : activeState.state === "processing"
            ? "processing"
            : "error"

      let shouldTouch = false

      if (course.preview_status !== nextStatus) {
        updateData.preview_status = nextStatus
        updateData.preview_last_state_changed_at = nowIso
        shouldTouch = true
      }

      const nextMessage = nextStatus === "error" ? activeState.message : null
      if (course.preview_upload_error !== nextMessage) {
        updateData.preview_upload_error = nextMessage
        shouldTouch = true
      }

      await supabase.from("courses").update(updateData).eq("id", course.id)

      if (shouldTouch) {
        previewUpdates++
        if (nextStatus === "error") errors++
        addTouchedCourse(touchedCourses, course.id, course.slug)
      } else if (nextStatus === "error") {
        errors++
      }
      continue
    }

    if (course.preview_video_url && course.preview_status !== "legacy") {
      await supabase
        .from("courses")
        .update({
          preview_status: "legacy",
          preview_last_state_changed_at: nowIso,
        })
        .eq("id", course.id)
      previewUpdates++
      addTouchedCourse(touchedCourses, course.id, course.slug)
      continue
    }

    if (
      !course.preview_video_url &&
      course.preview_status !== "none" &&
      !course.preview_bunny_video_id
    ) {
      await supabase
        .from("courses")
        .update({
          preview_status: "none",
          preview_upload_error: null,
          preview_last_state_changed_at: nowIso,
        })
        .eq("id", course.id)
      previewUpdates++
      addTouchedCourse(touchedCourses, course.id, course.slug)
    }
  }

  let lessonQuery = supabase
    .from("lessons")
    .select(
      [
        "id",
        "course_id",
        "title",
        "bunny_video_id",
        "bunny_library_id",
        "bunny_status",
        "bunny_last_checked_at",
        "bunny_last_state_changed_at",
        "pending_bunny_video_id",
        "pending_bunny_library_id",
        "pending_bunny_status",
        "video_upload_error",
        "duration_seconds",
        "courses!inner(id, slug)",
      ].join(", ")
    )

  if (options?.courseId) {
    lessonQuery = lessonQuery.eq("course_id", options.courseId)
  } else {
    lessonQuery = lessonQuery.or(
      "pending_bunny_video_id.not.is.null,bunny_status.neq.ready"
    )
  }

  const { data: lessonRows } = await lessonQuery
  const lessons = ((lessonRows ?? []) as unknown) as LessonMediaRow[]

  for (const lesson of lessons) {
    const course = Array.isArray(lesson.courses)
      ? lesson.courses[0]
      : lesson.courses
    const courseSlug = course?.slug

    if (!courseSlug) {
      continue
    }

    warnIfChecksAreStale({
      kind: "lesson",
      courseId: lesson.course_id,
      slug: courseSlug,
      lastCheckedAt: lesson.bunny_last_checked_at,
      source,
      throttleMs,
      force,
    })

    if (
      lesson.pending_bunny_video_id &&
      lesson.pending_bunny_status === "processing"
    ) {
      warnIfProcessingLooksStuck({
        kind: "lesson",
        courseId: lesson.course_id,
        slug: courseSlug,
        videoId: lesson.pending_bunny_video_id,
        stateChangedAt: lesson.bunny_last_state_changed_at,
        source,
      })
    } else if (lesson.bunny_status === "processing") {
      warnIfProcessingLooksStuck({
        kind: "lesson",
        courseId: lesson.course_id,
        slug: courseSlug,
        videoId: lesson.bunny_video_id,
        stateChangedAt: lesson.bunny_last_state_changed_at,
        source,
      })
    }

    if (lesson.pending_bunny_video_id && lesson.pending_bunny_library_id) {
      if (
        shouldSkipRemoteCheck({
          hasRelevantMedia: true,
          lastCheckedAt: lesson.bunny_last_checked_at,
          throttleMs,
          force,
        })
      ) {
        continue
      }

      const pendingState = await readRemoteBunnyState(lesson.pending_bunny_video_id)
      const updateData: Record<string, unknown> = {
        bunny_last_checked_at: nowIso,
      }

      if (pendingState.requestFailed) {
        await supabase.from("lessons").update(updateData).eq("id", lesson.id)
        errors++
        continue
      }

      if (pendingState.state === "ready") {
        const oldVideoId = lesson.bunny_video_id
        const promotionData: Record<string, unknown> = {
          ...updateData,
          bunny_video_id: lesson.pending_bunny_video_id,
          bunny_library_id: lesson.pending_bunny_library_id,
          bunny_status: "ready",
          pending_bunny_video_id: null,
          pending_bunny_library_id: null,
          pending_bunny_status: "none",
          video_upload_error: null,
          bunny_last_state_changed_at: nowIso,
        }

        if (pendingState.length > 0) {
          promotionData.duration_seconds = Math.round(pendingState.length)
        }

        await supabase.from("lessons").update(promotionData).eq("id", lesson.id)

        if (oldVideoId && oldVideoId !== lesson.pending_bunny_video_id) {
          await deleteBunnyVideo(oldVideoId).catch(() => undefined)
        }

        lessonUpdates++
        addTouchedCourse(touchedCourses, lesson.course_id, courseSlug)
        continue
      }

      if (pendingState.state === "processing") {
        let shouldTouch = false

        if (lesson.pending_bunny_status !== "processing") {
          updateData.pending_bunny_status = "processing"
          updateData.bunny_last_state_changed_at = nowIso
          shouldTouch = true
        }

        if (lesson.video_upload_error) {
          updateData.video_upload_error = null
          shouldTouch = true
        }

        await supabase.from("lessons").update(updateData).eq("id", lesson.id)

        if (shouldTouch) {
          lessonUpdates++
          addTouchedCourse(touchedCourses, lesson.course_id, courseSlug)
        }
        continue
      }

      let shouldTouch = false

      if (lesson.pending_bunny_status !== "error") {
        updateData.pending_bunny_status = "error"
        updateData.bunny_last_state_changed_at = nowIso
        shouldTouch = true
      }

      const nextMessage =
        pendingState.message ??
        "No se pudo procesar el nuevo video de esta leccion en Bunny."
      if (lesson.video_upload_error !== nextMessage) {
        updateData.video_upload_error = nextMessage
        shouldTouch = true
      }

      await supabase.from("lessons").update(updateData).eq("id", lesson.id)

      if (shouldTouch) {
        lessonUpdates++
        addTouchedCourse(touchedCourses, lesson.course_id, courseSlug)
      }
      errors++
      continue
    }

    if (
      shouldSkipRemoteCheck({
        hasRelevantMedia: isLessonCheckRelevant(lesson),
        lastCheckedAt: lesson.bunny_last_checked_at,
        throttleMs,
        force,
      })
    ) {
      continue
    }

    const activeState = await readRemoteBunnyState(lesson.bunny_video_id)
    const updateData: Record<string, unknown> = {
      bunny_last_checked_at: nowIso,
    }

    if (activeState.requestFailed) {
      await supabase.from("lessons").update(updateData).eq("id", lesson.id)
      errors++
      continue
    }

    const nextStatus =
      activeState.state === "ready"
        ? "ready"
        : activeState.state === "processing"
          ? "processing"
          : "error"

    let shouldUpdate = false

    if (lesson.bunny_status !== nextStatus) {
      updateData.bunny_status = nextStatus
      updateData.bunny_last_state_changed_at = nowIso
      shouldUpdate = true
    }

    const nextMessage = nextStatus === "error" ? activeState.message : null
    if (lesson.video_upload_error !== nextMessage) {
      updateData.video_upload_error = nextMessage
      shouldUpdate = true
    }

    if (
      nextStatus === "ready" &&
      activeState.length > 0 &&
      lesson.duration_seconds !== Math.round(activeState.length)
    ) {
      updateData.duration_seconds = Math.round(activeState.length)
      shouldUpdate = true
    }

    await supabase.from("lessons").update(updateData).eq("id", lesson.id)

    if (shouldUpdate) {
      lessonUpdates++
      if (nextStatus === "error") errors++
      addTouchedCourse(touchedCourses, lesson.course_id, courseSlug)
    } else if (nextStatus === "error") {
      errors++
    }
  }

  return {
    reconciled: previewUpdates + lessonUpdates,
    previewUpdates,
    lessonUpdates,
    errors,
    touchedCourses: [...touchedCourses.values()],
  }
}

export async function ensureCourseMediaFresh(
  courseId: string,
  options: EnsureCourseMediaFreshOptions
): Promise<BunnyReconcileResult> {
  const result = await reconcilePendingBunnyAssets({
    courseId,
    source: options.source,
    throttleMs: options.throttleMs,
    force: false,
  })

  if (result.reconciled > 0 || result.errors > 0) {
    logBunnyMedia("info", "course_media_freshness_checked", {
      courseId,
      source: options.source,
      reconciled: result.reconciled,
      previewUpdates: result.previewUpdates,
      lessonUpdates: result.lessonUpdates,
      errors: result.errors,
    })
  }

  return result
}

export async function reconcileBunnyVideoWebhook(
  videoId: string
): Promise<BunnyReconcileResult> {
  const supabase = createServiceRoleClient()
  const affectedCourseIds = new Set<string>()

  const [{ data: previewCourses }, { data: lessonCourses }] = await Promise.all([
    supabase
      .from("courses")
      .select("id")
      .or(
        `preview_bunny_video_id.eq.${videoId},pending_preview_bunny_video_id.eq.${videoId}`
      ),
    supabase
      .from("lessons")
      .select("course_id")
      .or(`bunny_video_id.eq.${videoId},pending_bunny_video_id.eq.${videoId}`),
  ])

  for (const course of previewCourses ?? []) {
    if (course.id) {
      affectedCourseIds.add(course.id)
    }
  }

  for (const lesson of lessonCourses ?? []) {
    if (lesson.course_id) {
      affectedCourseIds.add(lesson.course_id)
    }
  }

  if (affectedCourseIds.size === 0) {
    return {
      reconciled: 0,
      previewUpdates: 0,
      lessonUpdates: 0,
      errors: 0,
      touchedCourses: [],
    }
  }

  const results = await Promise.all(
    [...affectedCourseIds].map((courseId) =>
      reconcilePendingBunnyAssets({
        courseId,
        source: "webhook",
        force: true,
      })
    )
  )

  const touchedCourses = new Map<string, { id: string; slug: string }>()
  let reconciled = 0
  let previewUpdates = 0
  let lessonUpdates = 0
  let errors = 0

  for (const result of results) {
    reconciled += result.reconciled
    previewUpdates += result.previewUpdates
    lessonUpdates += result.lessonUpdates
    errors += result.errors

    for (const course of result.touchedCourses) {
      touchedCourses.set(course.id, course)
    }
  }

  return {
    reconciled,
    previewUpdates,
    lessonUpdates,
    errors,
    touchedCourses: [...touchedCourses.values()],
  }
}
