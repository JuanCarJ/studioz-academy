import { env } from "@/lib/env"
import { getCurrentUser } from "@/lib/supabase/auth"

export const runtime = "nodejs"

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") {
    return badRequest("No autorizado.", 401)
  }

  const { videoId } = await params
  if (!videoId?.trim()) {
    return badRequest("Video invalido.")
  }

  const body = Buffer.from(await request.arrayBuffer())
  if (body.byteLength === 0) {
    return badRequest("Archivo de video vacio.")
  }

  const response = await fetch(
    `https://video.bunnycdn.com/library/${env.BUNNY_LIBRARY_ID()}/videos/${videoId}`,
    {
      method: "PUT",
      headers: {
        AccessKey: env.BUNNY_API_KEY(),
        "Content-Type": "application/octet-stream",
      },
      body,
    }
  )

  if (!response.ok) {
    return badRequest(`Bunny upload failed (${response.status}).`, response.status)
  }

  return new Response(null, { status: 204 })
}
