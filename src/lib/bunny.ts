import { createHash } from "crypto"

import { env } from "@/lib/env"
import { createServiceRoleClient } from "@/lib/supabase/admin"

import type { Course, Lesson } from "@/types"

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

interface CoursePreviewRow {
  id: string
  slug: string
  preview_video_url: string | null
  preview_bunny_video_id: string | null
  preview_bunny_library_id: string | null
  preview_status: "none" | "legacy" | "processing" | "ready" | "error"
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
  pending_bunny_video_id: string | null
  pending_bunny_library_id: string | null
  pending_bunny_status: "none" | "processing" | "ready" | "error"
  video_upload_error: string | null
  duration_seconds: number
  courses: { id: string; slug: string } | { id: string; slug: string }[]
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
 * Upload a video to Bunny Stream library.
 */
export async function uploadVideo(
  file: File,
  title: string
): Promise<string> {
  const libraryId = env.BUNNY_LIBRARY_ID()
  const apiKey = env.BUNNY_API_KEY()

  // Step 1: Create video entry
  const createRes = await fetch(
    `https://video.bunnycdn.com/library/${libraryId}/videos`,
    {
      method: "POST",
      headers: {
        AccessKey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    }
  )

  if (!createRes.ok) {
    throw new Error(`Bunny: Failed to create video entry (${createRes.status})`)
  }

  const { guid } = (await createRes.json()) as { guid: string }

  // Step 2: Upload file
  const uploadRes = await fetch(
    `https://video.bunnycdn.com/library/${libraryId}/videos/${guid}`,
    {
      method: "PUT",
      headers: { AccessKey: apiKey },
      body: file,
    }
  )

  if (!uploadRes.ok) {
    throw new Error(`Bunny: Failed to upload video (${uploadRes.status})`)
  }

  return guid
}

/**
 * Create a video entry in Bunny Stream and return the video ID plus the
 * authenticated upload URL so the admin client can stream file bytes through
 * our server-side proxy without exposing the Bunny AccessKey in the browser.
 */
export async function createBunnyVideo(
  title: string
): Promise<{ videoId: string; uploadUrl: string }> {
  const libraryId = env.BUNNY_LIBRARY_ID()
  const apiKey = env.BUNNY_API_KEY()

  const res = await fetch(
    `https://video.bunnycdn.com/library/${libraryId}/videos`,
    {
      method: "POST",
      headers: {
        AccessKey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    }
  )

  if (!res.ok) {
    throw new Error(`Bunny: Failed to create video entry (${res.status})`)
  }

  const { guid } = (await res.json()) as { guid: string }

  // Route handlers attach the Bunny AccessKey server-side.
  const uploadUrl = `/api/admin/bunny/upload/${guid}`

  return { videoId: guid, uploadUrl }
}

/**
 * Delete a video from Bunny Stream library.
 * Silently succeeds if the video does not exist (404 is ignored).
 */
export async function deleteBunnyVideo(videoId: string): Promise<void> {
  const libraryId = env.BUNNY_LIBRARY_ID()
  const apiKey = env.BUNNY_API_KEY()

  const res = await fetch(
    `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
    {
      method: "DELETE",
      headers: { AccessKey: apiKey },
    }
  )

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
  const libraryId = env.BUNNY_LIBRARY_ID()
  const apiKey = env.BUNNY_API_KEY()

  const res = await fetch(
    `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
    {
      method: "GET",
      headers: { AccessKey: apiKey },
    }
  )

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

async function readRemoteBunnyState(videoId: string): Promise<{
  state: BunnyProcessingState
  length: number
  message: string | null
}> {
  try {
    const remote = await getVideoStatusOrNull(videoId)
    if (!remote) {
      return {
        state: "missing",
        length: 0,
        message: "El video ya no existe en Bunny.",
      }
    }

    const state = resolveBunnyStatusCode(remote.status)
    return {
      state,
      length: remote.length,
      message: getLessonStateMessage(state, null),
    }
  } catch {
    return {
      state: "error",
      length: 0,
      message: "No se pudo consultar el estado del video en Bunny.",
    }
  }
}

function addTouchedCourse(
  touchedCourses: Map<string, { id: string; slug: string }>,
  courseId: string,
  slug: string
) {
  touchedCourses.set(courseId, { id: courseId, slug })
}

export async function reconcilePendingBunnyAssets(options?: {
  courseId?: string
}): Promise<BunnyReconcileResult> {
  const supabase = createServiceRoleClient()
  const touchedCourses = new Map<string, { id: string; slug: string }>()
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
    const updates: Record<string, unknown> = {}

    if (
      course.pending_preview_bunny_video_id &&
      course.pending_preview_bunny_library_id
    ) {
      const pendingState = await readRemoteBunnyState(
        course.pending_preview_bunny_video_id
      )

      if (pendingState.state === "ready") {
        const oldVideoId = course.preview_bunny_video_id

        updates.preview_bunny_video_id = course.pending_preview_bunny_video_id
        updates.preview_bunny_library_id = course.pending_preview_bunny_library_id
        updates.preview_status = "ready"
        updates.preview_video_url = null
        updates.pending_preview_bunny_video_id = null
        updates.pending_preview_bunny_library_id = null
        updates.pending_preview_status = "none"
        updates.preview_upload_error = null

        await supabase.from("courses").update(updates).eq("id", course.id)

        if (oldVideoId && oldVideoId !== course.pending_preview_bunny_video_id) {
          await deleteBunnyVideo(oldVideoId).catch(() => undefined)
        }

        previewUpdates++
        addTouchedCourse(touchedCourses, course.id, course.slug)
        continue
      }

      if (pendingState.state === "processing") {
        if (
          course.pending_preview_status !== "processing" ||
          course.preview_upload_error
        ) {
          await supabase
            .from("courses")
            .update({
              pending_preview_status: "processing",
              preview_upload_error: null,
            })
            .eq("id", course.id)
          previewUpdates++
          addTouchedCourse(touchedCourses, course.id, course.slug)
        }
        continue
      }

      await supabase
        .from("courses")
        .update({
          pending_preview_status: "error",
          preview_upload_error:
            pendingState.message ??
            "No se pudo procesar la nueva vista previa en Bunny.",
        })
        .eq("id", course.id)
      previewUpdates++
      errors++
      addTouchedCourse(touchedCourses, course.id, course.slug)
      continue
    }

    if (course.preview_bunny_video_id) {
      const activeState = await readRemoteBunnyState(course.preview_bunny_video_id)
      const nextStatus =
        activeState.state === "ready"
          ? "ready"
          : activeState.state === "processing"
            ? "processing"
            : "error"

      if (
        course.preview_status !== nextStatus ||
        (nextStatus === "ready" && course.preview_upload_error) ||
        (nextStatus === "error" &&
          course.preview_upload_error !== activeState.message)
      ) {
        await supabase
          .from("courses")
          .update({
            preview_status: nextStatus,
            preview_upload_error:
              nextStatus === "error" ? activeState.message : null,
          })
          .eq("id", course.id)
        previewUpdates++
        if (nextStatus === "error") errors++
        addTouchedCourse(touchedCourses, course.id, course.slug)
      }
      continue
    }

    if (course.preview_video_url && course.preview_status !== "legacy") {
      await supabase
        .from("courses")
        .update({ preview_status: "legacy" })
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

    if (lesson.pending_bunny_video_id && lesson.pending_bunny_library_id) {
      const pendingState = await readRemoteBunnyState(lesson.pending_bunny_video_id)

      if (pendingState.state === "ready") {
        const oldVideoId = lesson.bunny_video_id
        const updateData: Record<string, unknown> = {
          bunny_video_id: lesson.pending_bunny_video_id,
          bunny_library_id: lesson.pending_bunny_library_id,
          bunny_status: "ready",
          pending_bunny_video_id: null,
          pending_bunny_library_id: null,
          pending_bunny_status: "none",
          video_upload_error: null,
        }

        if (pendingState.length > 0) {
          updateData.duration_seconds = Math.round(pendingState.length)
        }

        await supabase.from("lessons").update(updateData).eq("id", lesson.id)

        if (oldVideoId && oldVideoId !== lesson.pending_bunny_video_id) {
          await deleteBunnyVideo(oldVideoId).catch(() => undefined)
        }

        lessonUpdates++
        addTouchedCourse(touchedCourses, lesson.course_id, courseSlug)
        continue
      }

      if (pendingState.state === "processing") {
        if (
          lesson.pending_bunny_status !== "processing" ||
          lesson.video_upload_error
        ) {
          await supabase
            .from("lessons")
            .update({
              pending_bunny_status: "processing",
              video_upload_error: null,
            })
            .eq("id", lesson.id)
          lessonUpdates++
          addTouchedCourse(touchedCourses, lesson.course_id, courseSlug)
        }
        continue
      }

      await supabase
        .from("lessons")
        .update({
          pending_bunny_status: "error",
          video_upload_error:
            pendingState.message ??
            "No se pudo procesar el nuevo video de esta leccion en Bunny.",
        })
        .eq("id", lesson.id)
      lessonUpdates++
      errors++
      addTouchedCourse(touchedCourses, lesson.course_id, courseSlug)
      continue
    }

    const activeState = await readRemoteBunnyState(lesson.bunny_video_id)
    const nextStatus =
      activeState.state === "ready"
        ? "ready"
        : activeState.state === "processing"
          ? "processing"
          : "error"

    const updateData: Record<string, unknown> = {}
    let shouldUpdate = false

    if (lesson.bunny_status !== nextStatus) {
      updateData.bunny_status = nextStatus
      shouldUpdate = true
    }

    if (nextStatus === "ready" && lesson.video_upload_error) {
      updateData.video_upload_error = null
      shouldUpdate = true
    }

    if (
      nextStatus === "error" &&
      lesson.video_upload_error !== activeState.message
    ) {
      updateData.video_upload_error = activeState.message
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

    if (shouldUpdate) {
      await supabase.from("lessons").update(updateData).eq("id", lesson.id)
      lessonUpdates++
      if (nextStatus === "error") errors++
      addTouchedCourse(touchedCourses, lesson.course_id, courseSlug)
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
