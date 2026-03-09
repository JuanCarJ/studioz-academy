"use client"

import * as tus from "tus-js-client"

import type { BunnyUploadSession } from "@/types"

const BUNNY_DIRECT_MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024
const BUNNY_TUS_CHUNK_SIZE = 8 * 1024 * 1024

const activeUploads = new Map<string, tus.Upload>()

export function getBunnyUploadError(file: File) {
  if (file.size === 0) {
    return "Debes seleccionar un archivo de video valido."
  }

  if (file.size > BUNNY_DIRECT_MAX_FILE_BYTES) {
    return "El limite recomendado de carga es 4 GB por archivo."
  }

  return null
}

export async function uploadToBunnyDirect(
  uploadSession: BunnyUploadSession,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  const uploadKey = uploadSession.videoId

  const upload = new tus.Upload(file, {
    endpoint: uploadSession.tusEndpoint,
    chunkSize: BUNNY_TUS_CHUNK_SIZE,
    retryDelays: [0, 1_000, 3_000, 5_000, 10_000, 20_000],
    removeFingerprintOnSuccess: true,
    metadata: {
      filename: file.name,
      filetype: file.type || "application/octet-stream",
    },
    headers: {
      AuthorizationSignature: uploadSession.signature,
      AuthorizationExpire: String(uploadSession.expirationTime),
      LibraryId: uploadSession.libraryId,
      VideoId: uploadSession.videoId,
    },
    fingerprint: async () =>
      [
        "bunny-tus",
        uploadSession.videoId,
        file.name,
        file.type,
        file.size,
        file.lastModified,
      ].join("-"),
    onProgress(bytesUploaded, bytesTotal) {
      if (bytesTotal <= 0) return

      const percent = Math.round((bytesUploaded / bytesTotal) * 100)
      onProgress(percent)
    },
  })

  activeUploads.set(uploadKey, upload)

  try {
    const previousUploads = await upload.findPreviousUploads()
    if (previousUploads.length > 0) {
      upload.resumeFromPreviousUpload(previousUploads[0])
    }

    await new Promise<void>((resolve, reject) => {
      upload.options.onError = (error) => {
        activeUploads.delete(uploadKey)
        reject(error)
      }

      upload.options.onSuccess = () => {
        activeUploads.delete(uploadKey)
        onProgress(100)
        resolve()
      }

      upload.start()
    })
  } catch (error) {
    activeUploads.delete(uploadKey)
    throw error
  }
}

export function cancelActiveBunnyUpload(uploadKey: string) {
  const upload = activeUploads.get(uploadKey)
  if (!upload) return

  activeUploads.delete(uploadKey)
  void upload.abort(true)
}
