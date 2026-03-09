import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { loadLocalEnv, requiredEnv } from "./env"

loadLocalEnv()

const BUNNY_API_BASE_URL = "https://video.bunnycdn.com"
const DEFAULT_READY_TIMEOUT_MS = 10 * 60_000
const DEFAULT_POLL_INTERVAL_MS = 5_000

interface BunnyVideoCreateResponse {
  guid: string
}

export interface BunnyVideo {
  guid: string
  title: string
  status: number
  length: number
}

export interface WaitForBunnyVideoReadyOptions {
  timeoutMs?: number
  pollIntervalMs?: number
}

function getLibraryId() {
  return requiredEnv("BUNNY_LIBRARY_ID")
}

function getApiKey() {
  return requiredEnv("BUNNY_API_KEY")
}

function getTokenAuthKey() {
  return requiredEnv("BUNNY_TOKEN_AUTH_KEY")
}

function buildApiUrl(pathname: string) {
  return `${BUNNY_API_BASE_URL}/library/${getLibraryId()}${pathname}`
}

function buildHeaders(headers?: HeadersInit) {
  const finalHeaders = new Headers(headers)
  finalHeaders.set("AccessKey", getApiKey())
  return finalHeaders
}

async function parseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string }
    return payload.message ?? response.statusText
  } catch {
    return response.statusText
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function ensureBunnyEnv() {
  return {
    apiKey: getApiKey(),
    libraryId: getLibraryId(),
    tokenAuthKey: getTokenAuthKey(),
  }
}

export function getDefaultBunnyFixturePath() {
  return path.resolve(process.cwd(), "../videos/IMG_6567.MOV")
}

export async function ensureFixtureExists(filePath: string) {
  await fs.access(filePath)
  return filePath
}

export async function createBunnyVideo(title: string) {
  const response = await fetch(buildApiUrl("/videos"), {
    method: "POST",
    headers: buildHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ title }),
  })

  if (!response.ok) {
    throw new Error(
      `Bunny create video failed (${response.status}): ${await parseErrorMessage(response)}`
    )
  }

  const payload = (await response.json()) as BunnyVideoCreateResponse
  return payload.guid
}

export async function uploadVideoFile(videoId: string, filePath: string) {
  const body = await fs.readFile(filePath)
  const response = await fetch(buildApiUrl(`/videos/${videoId}`), {
    method: "PUT",
    headers: buildHeaders({
      "Content-Type": "application/octet-stream",
    }),
    body,
  })

  if (!response.ok) {
    throw new Error(
      `Bunny upload failed (${response.status}): ${await parseErrorMessage(response)}`
    )
  }
}

export async function getBunnyVideo(videoId: string): Promise<BunnyVideo | null> {
  const response = await fetch(buildApiUrl(`/videos/${videoId}`), {
    method: "GET",
    headers: buildHeaders(),
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(
      `Bunny get video failed (${response.status}): ${await parseErrorMessage(response)}`
    )
  }

  return (await response.json()) as BunnyVideo
}

export async function waitForBunnyVideoReady(
  videoId: string,
  options: WaitForBunnyVideoReadyOptions = {}
) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const deadline = Date.now() + timeoutMs

  let lastStatus: number | null = null

  while (Date.now() < deadline) {
    const video = await getBunnyVideo(videoId)

    if (!video) {
      throw new Error(`Bunny video ${videoId} no longer exists while waiting for readiness.`)
    }

    lastStatus = video.status

    if (video.status === 4) {
      return video
    }

    if (video.status === 5 || video.status === 6) {
      throw new Error(`Bunny video ${videoId} entered failure status ${video.status}.`)
    }

    await sleep(pollIntervalMs)
  }

  throw new Error(
    `Timed out waiting for Bunny video ${videoId} to be ready. Last status: ${lastStatus ?? "unknown"}.`
  )
}

export async function deleteBunnyVideo(videoId: string) {
  const response = await fetch(buildApiUrl(`/videos/${videoId}`), {
    method: "DELETE",
    headers: buildHeaders(),
  })

  if (response.status === 404) {
    return
  }

  if (!response.ok) {
    throw new Error(
      `Bunny delete failed (${response.status}): ${await parseErrorMessage(response)}`
    )
  }
}

export function buildSignedEmbedUrl(
  videoId: string,
  expiresInSeconds = 24 * 60 * 60
) {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds
  const token = createHash("sha256")
    .update(getTokenAuthKey() + videoId + expires)
    .digest("hex")

  return `https://iframe.mediadelivery.net/embed/${getLibraryId()}/${videoId}?token=${token}&expires=${expires}`
}
