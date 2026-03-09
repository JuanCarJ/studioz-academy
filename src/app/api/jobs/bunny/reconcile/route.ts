import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"

import { reconcilePendingBunnyAssets } from "@/lib/bunny"

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
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await reconcilePendingBunnyAssets()
  revalidateTouchedCoursePaths(result.touchedCourses)

  return NextResponse.json({
    ok: true,
    ...result,
    timestamp: new Date().toISOString(),
  })
}
