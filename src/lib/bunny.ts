import { createHash } from "crypto"
import { revalidatePath } from "next/cache"

import { env } from "@/lib/env"
import { createServiceRoleClient } from "@/lib/supabase/admin"

import type { BunnyUploadSession, Course, Lesson } from "@/types"
import type { Database } from "@/types/database"

const BUNNY_API_BASE_URL = "https://video.bunnycdn.com"
const BUNNY_TUS_ENDPOINT = `${BUNNY_API_BASE_URL}/tusupload`
const DEFAULT_TUS_SESSION_TTL_SECONDS = 60 * 60
const DEFAULT_BUNNY_CHECK_THROTTLE_MS = 30_000
export const COURSE_MEDIA_HEALTH_THROTTLE_MS = 5 * 60_000
const PROCESSING_WARNING_THRESHOLD_MS = 30 * 60_000
const STALE_CHECK_WARNING_THRESHOLD_MS = 2 * 60_000
const RECONCILE_BATCH_SIZE = 20
const RECONCILE_BUDGET_MS = 30_000
const BUNNY_VIDEO_ID_PATTERN =
  /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

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

  const host = env.BUNNY_PLAYER_VERSION() === "v2"
    ? "player.mediadelivery.net"
    : "iframe.mediadelivery.net"
  return `https://${host}/embed/${libraryId}/${videoId}?token=${token}&expires=${expirationEpoch}`
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
 * Request deferred cleanup, never DELETE inline. A reference recheck alone
 * cannot make a database update + remote DELETE atomic. Cleanup stays deferred
 * until a separately authorized worker can prevent reattachment during deletion.
 */
export async function deleteBunnyVideo(videoId: string): Promise<void> {
  if (!isManagedBunnyVideoId(videoId)) return
  const supabase = createServiceRoleClient()
  const [courses, lessons] = await Promise.all([
    supabase.from("courses").select("id")
      .or(`preview_bunny_video_id.eq.${videoId},pending_preview_bunny_video_id.eq.${videoId}`).limit(1),
    supabase.from("lessons").select("id")
      .or(`bunny_video_id.eq.${videoId},pending_bunny_video_id.eq.${videoId}`).limit(1),
  ])
  if (courses.error || lessons.error) throw new Error("Bunny cleanup reference check failed")
  if (courses.data?.length || lessons.data?.length) return
  const { error } = await supabase.from("bunny_cleanup_queue").upsert({
    library_id: env.BUNNY_LIBRARY_ID(),
    video_id: videoId,
    status: "deferred",
  }, { onConflict: "library_id,video_id", ignoreDuplicates: true })
  if (error) throw new Error("Bunny cleanup could not be queued")
}

/** Compare-and-swap: zero matching rows means the media changed while in flight. */
export async function updateBunnyMediaSnapshot(
  supabase: ReturnType<typeof createServiceRoleClient>,
  table: "courses" | "lessons",
  id: string,
  expected: Record<string, string | number | boolean | null>,
  changes: Record<string, unknown>
): Promise<{ applied: boolean; error: boolean }> {
  const patch = changes as Database["public"]["Tables"][typeof table]["Update"]
  let query = supabase.from(table).update(patch).eq("id", id)
  for (const [column, value] of Object.entries(expected)) {
    query = value === null ? query.is(column, null) : query.eq(column, value)
  }
  const { data, error } = await query.select("id").maybeSingle()
  return { applied: !error && !!data, error: !!error }
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
    signal: AbortSignal.timeout(8_000),
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
    return "Estamos preparando este video. Intenta de nuevo en unos minutos."
  }
  if (state === "missing") {
    return "El video no esta disponible en este momento. Intenta de nuevo mas tarde."
  }
  return fallbackError ?? "No pudimos preparar este video. Contacta a soporte si el problema continua."
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
  const hasManagedVideoId = isManagedBunnyVideoId(lesson.bunny_video_id)
  const state =
    lesson.bunny_status === "error"
      ? "error"
      : lesson.bunny_status === "ready"
        ? hasManagedVideoId
          ? "ready"
          : "missing"
        : "processing"

  const invalidReadyMessage =
    lesson.bunny_status === "ready" && !hasManagedVideoId
      ? "Este video no esta disponible. Contacta a soporte si el problema continua."
      : null

  return {
    state,
    message: invalidReadyMessage ?? getLessonStateMessage(state, lesson.video_upload_error),
    isPlayable: state === "ready" && hasManagedVideoId,
    videoId: hasManagedVideoId ? lesson.bunny_video_id : null,
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
  const hasManagedPreviewVideoId = isManagedBunnyVideoId(course.preview_bunny_video_id)

  if (hasManagedPreviewVideoId && course.preview_status === "ready") {
    const previewVideoId = course.preview_bunny_video_id!

    return {
      kind: "ready",
      url: generateSignedUrl(previewVideoId),
      message: null,
      isPlayable: true,
      videoId: previewVideoId,
    }
  }

  if (course.preview_bunny_video_id && course.preview_status === "ready") {
    return {
      kind: "error",
      url: null,
      message: "La vista previa no esta disponible en este momento.",
      isPlayable: false,
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
        "No pudimos preparar la vista previa. Intenta de nuevo mas tarde.",
      isPlayable: false,
      videoId: course.preview_bunny_video_id,
    }
  }

  if (course.preview_bunny_video_id && course.preview_status === "processing") {
    return {
      kind: "processing",
      url: null,
      message: "Estamos preparando la vista previa. Estara disponible en unos minutos.",
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

function isMediaCheckStale(
  value: string | null | undefined,
  throttleMs: number
): boolean {
  const elapsedMs = getElapsedMs(value, Date.now())
  return elapsedMs == null || elapsedMs >= throttleMs
}

export function isManagedBunnyVideoId(videoId: string | null | undefined): videoId is string {
  return typeof videoId === "string" && BUNNY_VIDEO_ID_PATTERN.test(videoId)
}

export function shouldRefreshCourseMediaHealth(
  course: {
    preview_bunny_video_id: string | null
    preview_last_checked_at: string | null
    preview_status: string | null
    pending_preview_bunny_video_id: string | null
  },
  lessons: Array<
    {
      bunny_video_id: string | null
      bunny_last_checked_at: string | null
      bunny_status: string | null
      pending_bunny_video_id: string | null
    }
  >,
  throttleMs = COURSE_MEDIA_HEALTH_THROTTLE_MS
): boolean {
  if (isManagedBunnyVideoId(course.pending_preview_bunny_video_id)) {
    return true
  }

  if (
    isManagedBunnyVideoId(course.preview_bunny_video_id) &&
    (course.preview_status !== "ready" ||
      isMediaCheckStale(course.preview_last_checked_at, throttleMs))
  ) {
    return true
  }

  return lessons.some((lesson) => {
    if (isManagedBunnyVideoId(lesson.pending_bunny_video_id)) {
      return true
    }

    return (
      isManagedBunnyVideoId(lesson.bunny_video_id) &&
      (lesson.bunny_status !== "ready" ||
        isMediaCheckStale(lesson.bunny_last_checked_at, throttleMs))
    )
  })
}

function shouldSkipRemoteCheck(input: {
  hasRelevantMedia: boolean
  lastCheckedAt: string | null
  throttleMs: number
  force: boolean
}): boolean {
  if (input.force) {
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
    isManagedBunnyVideoId(course.pending_preview_bunny_video_id) ||
    (isManagedBunnyVideoId(course.preview_bunny_video_id) &&
      course.preview_status !== "ready")
  )
}

function isLessonCheckRelevant(lesson: LessonMediaRow): boolean {
  return (
    isManagedBunnyVideoId(lesson.pending_bunny_video_id) ||
    (isManagedBunnyVideoId(lesson.bunny_video_id) &&
      lesson.bunny_status !== "ready")
  )
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
        message: "El video no esta disponible. Contacta a soporte si el problema continua.",
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
      message: "No pudimos comprobar el video. Intenta de nuevo en unos minutos.",
      requestFailed: true,
    }
  }
}

export async function reconcilePendingBunnyAssets(options?: {
  courseId?: string
  videoId?: string
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
  const deadline = Date.now() + RECONCILE_BUDGET_MS
  const previewDeadline = Date.now() + RECONCILE_BUDGET_MS / 2
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

  if (options?.videoId) {
    if (!isManagedBunnyVideoId(options.videoId)) throw new Error("Invalid Bunny video ID")
    courseQuery = courseQuery.or(`preview_bunny_video_id.eq.${options.videoId},pending_preview_bunny_video_id.eq.${options.videoId}`)
  } else if (options?.courseId) {
    courseQuery = courseQuery.eq("id", options.courseId)
  } else {
    courseQuery = courseQuery.or(
      "pending_preview_bunny_video_id.not.is.null,preview_status.eq.processing,preview_status.eq.error,pending_preview_status.eq.processing,pending_preview_status.eq.error"
    )
  }

  const { data: courseRows, error: courseError } = await courseQuery
    .order("preview_last_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(RECONCILE_BATCH_SIZE)
  if (courseError) throw new Error("Bunny course work lookup failed")
  const courses = ((courseRows ?? []) as unknown) as CoursePreviewRow[]

  for (const course of courses) {
    if (Date.now() >= previewDeadline) break
    const updateCourse = async (changes: Record<string, unknown>) => {
      const result = await updateBunnyMediaSnapshot(supabase, "courses", course.id, {
        preview_bunny_video_id: course.preview_bunny_video_id,
        preview_bunny_library_id: course.preview_bunny_library_id,
        pending_preview_bunny_video_id: course.pending_preview_bunny_video_id,
        pending_preview_bunny_library_id: course.pending_preview_bunny_library_id,
        preview_video_url: course.preview_video_url,
        preview_status: course.preview_status,
        pending_preview_status: course.pending_preview_status,
        preview_last_checked_at: course.preview_last_checked_at,
        preview_last_state_changed_at: course.preview_last_state_changed_at,
      }, changes)
      if (result.error) errors++
      return result.applied
    }
    const previewLibrary = course.pending_preview_bunny_video_id
      ? course.pending_preview_bunny_library_id : course.preview_bunny_library_id
    if (previewLibrary && previewLibrary !== env.BUNNY_LIBRARY_ID()) {
      await updateCourse({ preview_last_checked_at: nowIso })
      errors++
      continue
    }
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
      isManagedBunnyVideoId(course.pending_preview_bunny_video_id) &&
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
        await updateCourse(updateData)
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

        if (!await updateCourse(updateData)) continue

        if (oldVideoId && oldVideoId !== course.pending_preview_bunny_video_id) {
          await deleteBunnyVideo(oldVideoId).catch(() => {
            errors++
            logBunnyMedia("error", "cleanup_queue_failed", { videoId: oldVideoId, courseId: course.id })
          })
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

        if (!await updateCourse(updateData)) continue

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

      if (!await updateCourse(updateData)) continue

      if (shouldTouch) {
        previewUpdates++
        addTouchedCourse(touchedCourses, course.id, course.slug)
      }
      errors++
      continue
    }

    if (isManagedBunnyVideoId(course.preview_bunny_video_id)) {
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
        await updateCourse(updateData)
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

      if (!await updateCourse(updateData)) continue

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
      if (!await updateCourse({
          preview_status: "legacy",
          preview_last_state_changed_at: nowIso,
        })) continue
      previewUpdates++
      addTouchedCourse(touchedCourses, course.id, course.slug)
      continue
    }

    if (
      !course.preview_video_url &&
      course.preview_status !== "none" &&
      !course.preview_bunny_video_id
    ) {
      if (!await updateCourse({
          preview_status: "none",
          preview_upload_error: null,
          preview_last_state_changed_at: nowIso,
        })) continue
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

  if (options?.videoId) {
    lessonQuery = lessonQuery.or(`bunny_video_id.eq.${options.videoId},pending_bunny_video_id.eq.${options.videoId}`)
  } else if (options?.courseId) {
    lessonQuery = lessonQuery.eq("course_id", options.courseId)
  } else {
    lessonQuery = lessonQuery.or(
      "pending_bunny_video_id.not.is.null,bunny_status.neq.ready"
    )
  }

  const { data: lessonRows, error: lessonError } = await lessonQuery
    .order("bunny_last_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(RECONCILE_BATCH_SIZE)
  if (lessonError) throw new Error("Bunny lesson work lookup failed")
  const lessons = ((lessonRows ?? []) as unknown) as LessonMediaRow[]

  for (const lesson of lessons) {
    if (Date.now() >= deadline) break
    const updateLesson = async (changes: Record<string, unknown>) => {
      const result = await updateBunnyMediaSnapshot(supabase, "lessons", lesson.id, {
        bunny_video_id: lesson.bunny_video_id,
        bunny_library_id: lesson.bunny_library_id,
        pending_bunny_video_id: lesson.pending_bunny_video_id,
        pending_bunny_library_id: lesson.pending_bunny_library_id,
        bunny_status: lesson.bunny_status,
        pending_bunny_status: lesson.pending_bunny_status,
        bunny_last_checked_at: lesson.bunny_last_checked_at,
        bunny_last_state_changed_at: lesson.bunny_last_state_changed_at,
      }, changes)
      if (result.error) errors++
      return result.applied
    }
    const lessonLibrary = lesson.pending_bunny_video_id
      ? lesson.pending_bunny_library_id : lesson.bunny_library_id
    if (lessonLibrary && lessonLibrary !== env.BUNNY_LIBRARY_ID()) {
      await updateLesson({ bunny_last_checked_at: nowIso })
      errors++
      continue
    }
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

    if (
      isManagedBunnyVideoId(lesson.pending_bunny_video_id) &&
      lesson.pending_bunny_library_id
    ) {
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
        await updateLesson(updateData)
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

        if (!await updateLesson(promotionData)) continue

        if (oldVideoId && oldVideoId !== lesson.pending_bunny_video_id) {
          await deleteBunnyVideo(oldVideoId).catch(() => {
            errors++
            logBunnyMedia("error", "cleanup_queue_failed", { videoId: oldVideoId, lessonId: lesson.id })
          })
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

        if (!await updateLesson(updateData)) continue

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

      if (!await updateLesson(updateData)) continue

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

    if (!isManagedBunnyVideoId(lesson.bunny_video_id)) {
      await updateLesson({ bunny_last_checked_at: nowIso })
      continue
    }

    const activeState = await readRemoteBunnyState(lesson.bunny_video_id)
    const updateData: Record<string, unknown> = {
      bunny_last_checked_at: nowIso,
    }

    if (activeState.requestFailed) {
      await updateLesson(updateData)
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

    if (!await updateLesson(updateData)) continue

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
  if (!isManagedBunnyVideoId(videoId)) throw new Error("Invalid Bunny video ID")
  // Provider state is fetched again: webhook Status may be delayed or replayed.
  // Match only this asset instead of scanning all lessons in each affected course.
  return reconcilePendingBunnyAssets({ videoId, source: "webhook", force: true })
}
