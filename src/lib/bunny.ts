import { createHash } from "crypto"

import { env } from "@/lib/env"

/**
 * Generate a signed iframe embed URL for Bunny Stream video playback.
 *
 * Token authentication:
 * - path = /<libraryId>/<videoId>
 * - token = MD5(securityKey + path + expirationEpoch)
 * - URL = https://iframe.mediadelivery.net/embed/<libraryId>/<videoId>?token=<token>&expires=<epoch>
 *
 * Default expiration: 6 hours (21600s) per ARQUITECTURA_TECNICA.md sec 5.3
 */
export function generateSignedUrl(
  videoId: string,
  expiresInSeconds = 21600
): string {
  const libraryId = env.BUNNY_LIBRARY_ID()
  const securityKey = env.BUNNY_TOKEN_AUTH_KEY()

  const expirationEpoch = Math.floor(Date.now() / 1000) + expiresInSeconds
  const path = `/${libraryId}/${videoId}`

  // Bunny uses MD5 for token auth (not SHA-256)
  const token = createHash("md5")
    .update(securityKey + path + expirationEpoch)
    .digest("hex")

  return `https://iframe.mediadelivery.net/embed${path}?token=${token}&expires=${expirationEpoch}`
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
 * direct upload URL so the client can upload directly, bypassing Vercel.
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

  // The direct PUT upload URL for client-side upload
  const uploadUrl = `https://video.bunnycdn.com/library/${libraryId}/videos/${guid}`

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
): Promise<{ status: number; length: number }> {
  const libraryId = env.BUNNY_LIBRARY_ID()
  const apiKey = env.BUNNY_API_KEY()

  const res = await fetch(
    `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
    {
      method: "GET",
      headers: { AccessKey: apiKey },
    }
  )

  if (!res.ok) {
    throw new Error(`Bunny: Failed to get video status (${res.status})`)
  }

  const data = (await res.json()) as { status: number; length: number }
  return { status: data.status, length: data.length }
}
