import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

import { reconcileBunnyVideoWebhook } from "@/lib/bunny"
import { env } from "@/lib/env"

interface BunnyWebhookPayload {
  VideoGuid?: string
  Status?: number
  [key: string]: unknown
}

function revalidateTouchedCoursePaths(
  touchedCourses: Array<{ id: string; slug: string }>
) {
  if (touchedCourses.length === 0) {
    return
  }

  revalidatePath("/admin/cursos")
  revalidatePath("/cursos")

  for (const course of touchedCourses) {
    revalidatePath(`/admin/cursos/${course.id}/editar`)
    revalidatePath(`/cursos/${course.slug}`)
    revalidatePath(`/dashboard/cursos/${course.slug}`)
  }
}

export async function POST(request: NextRequest) {
  let expectedSecret: string

  try {
    expectedSecret = env.BUNNY_WEBHOOK_SECRET()
  } catch {
    return NextResponse.json(
      { error: "Bunny webhook is not configured." },
      { status: 500 }
    )
  }

  const providedSecret = request.nextUrl.searchParams.get("secret")
  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: BunnyWebhookPayload
  try {
    body = (await request.json()) as BunnyWebhookPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const videoId = typeof body.VideoGuid === "string" ? body.VideoGuid.trim() : ""
  if (!videoId) {
    return NextResponse.json({ error: "Missing VideoGuid" }, { status: 400 })
  }

  const result = await reconcileBunnyVideoWebhook(videoId)
  revalidateTouchedCoursePaths(result.touchedCourses)

  return NextResponse.json({
    ok: true,
    videoId,
    status: typeof body.Status === "number" ? body.Status : null,
    ...result,
    timestamp: new Date().toISOString(),
  })
}
