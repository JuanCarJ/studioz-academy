import "server-only"
import sharp from "sharp"

export const MAX_AVATAR_SIZE = 2 * 1024 * 1024
const MAX_AVATAR_PIXELS = 16_000_000

function hasSupportedSignature(buffer: Buffer): boolean {
  return (
    (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP")
  )
}

/** Decode pixels and emit a fresh, metadata-free WebP; MIME/name are not trusted. */
export async function normalizeAvatar(file: File): Promise<Buffer> {
  if (file.size <= 0 || file.size > MAX_AVATAR_SIZE) throw new Error("invalid_avatar_size")
  const buffer = Buffer.from(await file.arrayBuffer())
  if (!hasSupportedSignature(buffer)) throw new Error("invalid_avatar_format")
  const image = sharp(buffer, { limitInputPixels: MAX_AVATAR_PIXELS, failOn: "warning" })
  const metadata = await image.metadata()
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) ||
      (metadata.pages ?? 1) > 1) throw new Error("invalid_avatar_format")
  return image.rotate().resize(512, 512, { fit: "cover", withoutEnlargement: true })
    .webp({ quality: 85 }).toBuffer()
}
