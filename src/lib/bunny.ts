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
