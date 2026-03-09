export async function uploadToBunnyProxy(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return

      const percent = Math.round((event.loaded / event.total) * 100)
      onProgress(percent)
    })

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve()
        return
      }

      reject(new Error(`Bunny upload failed with status ${xhr.status}`))
    })

    xhr.addEventListener("error", () => {
      reject(new Error("Bunny upload network error"))
    })

    xhr.open("PUT", uploadUrl)
    xhr.send(file)
  })
}
