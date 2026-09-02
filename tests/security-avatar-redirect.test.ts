import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { normalizeAvatar, MAX_AVATAR_SIZE } from "@/lib/security/avatar"
import { getSafeRedirectPath } from "@/lib/auth-intent"

describe("avatar decoding", () => {
  it("rejects HTML spoofing a supported MIME type and filename", async () => {
    const file = new File(["<script>alert(1)</script>"], "avatar.jpg", { type: "image/jpeg" })
    await expect(normalizeAvatar(file)).rejects.toThrow("invalid_avatar_format")
  })
  it("rejects a truncated JPEG with otherwise valid magic bytes", async () => {
    const file = new File([new Uint8Array([255, 216, 255, 224, 0])], "photo.jpg")
    await expect(normalizeAvatar(file)).rejects.toThrow()
  })
  it("rejects oversized files before allocating or decoding pixels", async () => {
    await expect(normalizeAvatar(new File([new Uint8Array(MAX_AVATAR_SIZE + 1)], "large.png")))
      .rejects.toThrow("invalid_avatar_size")
  })
  it("trusts decoded pixels, reencodes to WebP and bounds output dimensions", async () => {
    const png = await sharp({ create: { width: 700, height: 600, channels: 3, background: "red" } }).png().toBuffer()
    const output = await normalizeAvatar(new File([new Uint8Array(png)], "misleading.html", { type: "text/html" }))
    const metadata = await sharp(output).metadata()
    expect(metadata.format).toBe("webp")
    expect(metadata.width).toBe(512)
    expect(metadata.height).toBe(512)
    expect(metadata.exif).toBeUndefined()
  })
})

describe("post-auth redirects", () => {
  it.each(["https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/\n/evil.invalid", "\\evil.invalid"])("rejects external or browser-normalized escapes: %s", (path) => {
    expect(getSafeRedirectPath(path)).toBeNull()
  })
  it("preserves a relative path and checkout continuation query", () => {
    expect(getSafeRedirectPath("/carrito?intent=add_to_cart&courseId=123"))
      .toBe("/carrito?intent=add_to_cart&courseId=123")
  })
})
