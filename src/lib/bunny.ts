/**
 * Generate a signed URL for Bunny Stream video playback.
 * Uses BUNNY_TOKEN_AUTH_KEY for token authentication.
 */
export function generateSignedUrl(videoId: string, expiresInSeconds = 3600): string {
  // TODO: Implement Bunny token authentication
  // See: docs/arquitectura/ARQUITECTURA_TECNICA.md sec 6
  console.log("generateSignedUrl", videoId, expiresInSeconds)
  return ""
}

/**
 * Upload a video to Bunny Stream library.
 */
export async function uploadVideo(file: File, title: string): Promise<string> {
  // TODO: POST to Bunny Stream API
  console.log("uploadVideo", title, file.size)
  return ""
}
