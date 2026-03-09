import { NextResponse } from "next/server"

import { createServerClient } from "@/lib/supabase/server"
import { isValidCsrfToken } from "@/lib/security/csrf"
import {
  persistCourseLastAccess,
  persistExitVideoProgress,
  revalidateVideoProgressPaths,
  resolveEnrolledLessonAccess,
} from "@/lib/video-progress"

const ALLOWED_REASONS = new Set(["pause", "logout", "pagehide"])

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()

    if (!(await isValidCsrfToken(formData))) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 })
    }

    const courseId = formData.get("courseId")
    const lessonId = formData.get("lessonId")
    const positionRaw = formData.get("position")
    const reason = formData.get("reason")

    if (typeof courseId !== "string" || courseId.length === 0) {
      return badRequest("Missing courseId")
    }

    if (typeof lessonId !== "string" || lessonId.length === 0) {
      return badRequest("Missing lessonId")
    }

    if (typeof reason !== "string" || !ALLOWED_REASONS.has(reason)) {
      return badRequest("Invalid flush reason")
    }

    const position = Number(positionRaw)
    if (!Number.isFinite(position) || position < 0) {
      return badRequest("Invalid position")
    }

    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const lessonAccess = await resolveEnrolledLessonAccess({
      supabase,
      userId: user.id,
      lessonId,
      expectedCourseId: courseId,
    })

    if (!lessonAccess.ok) {
      const status =
        lessonAccess.reason === "not_enrolled"
          ? 403
          : 400

      return NextResponse.json({ error: lessonAccess.reason }, { status })
    }

    if (position > 0) {
      await persistExitVideoProgress({
        userId: user.id,
        courseId,
        lessonId,
        position,
      })
    } else {
      await persistCourseLastAccess({
        userId: user.id,
        courseId,
        lessonId,
      })
    }

    revalidateVideoProgressPaths(lessonAccess.courseSlug)

    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: "Unable to persist video progress" }, { status: 500 })
  }
}
