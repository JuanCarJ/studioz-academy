import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { generateSignedUrl } from "@/lib/bunny"
import { PlayerView } from "@/components/courses/PlayerView"

import type { Lesson } from "@/types"

export default async function CoursePlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const supabase = await createServerClient()

  // Fetch course + lessons
  const { data: course } = await supabase
    .from("courses")
    .select("id, title, slug, lessons(*)")
    .eq("slug", slug)
    .single()

  if (!course) redirect("/cursos")

  // Verify enrollment
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", course.id)
    .maybeSingle()

  if (!enrollment) redirect(`/cursos/${slug}`)

  // Sort lessons by sort_order
  const lessons = ((course.lessons ?? []) as Lesson[]).sort(
    (a, b) => a.sort_order - b.sort_order
  )
  const lessonIds = lessons.map((l) => l.id)

  // Fetch course progress + lesson progress in parallel.
  // lesson_progress includes video_position so we can restore playback.
  const [{ data: progress }, { data: lessonProgressData }] = await Promise.all([
    supabase
      .from("course_progress")
      .select("last_lesson_id")
      .eq("user_id", user.id)
      .eq("course_id", course.id)
      .maybeSingle(),
    supabase
      .from("lesson_progress")
      .select("lesson_id, completed, video_position")
      .eq("user_id", user.id)
      .in("lesson_id", lessonIds),
  ])

  // Build lookup maps from lesson progress rows
  const completedLessonIds = new Set<string>()
  const videoPositionMap = new Map<string, number>()

  for (const lp of lessonProgressData ?? []) {
    if (lp.completed) completedLessonIds.add(lp.lesson_id)
    if (typeof lp.video_position === "number" && lp.video_position > 0) {
      videoPositionMap.set(lp.lesson_id, lp.video_position)
    }
  }

  // Determine active lesson (resume from last accessed, or first lesson)
  const activeLessonId = progress?.last_lesson_id ?? lessons[0]?.id
  const activeLesson = lessons.find((l) => l.id === activeLessonId) ?? lessons[0]

  // Generate signed URL for active lesson
  let initialSignedUrl = ""
  if (activeLesson?.bunny_video_id) {
    initialSignedUrl = generateSignedUrl(activeLesson.bunny_video_id)
  }

  // Restore saved video position for the active lesson (0 if none saved)
  const initialPosition = activeLesson
    ? (videoPositionMap.get(activeLesson.id) ?? 0)
    : 0

  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        `Hola, necesito ayuda con el curso ${course.title}`
      )}`
    : null

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">{course.title}</h1>

      <PlayerView
        courseId={course.id}
        lessons={lessons.map((l) => ({
          id: l.id,
          title: l.title,
          durationSeconds: l.duration_seconds,
          isFree: l.is_free,
          isCompleted: completedLessonIds.has(l.id),
        }))}
        activeLessonId={activeLesson?.id ?? ""}
        initialSignedUrl={initialSignedUrl}
        initialPosition={initialPosition}
      />

      {whatsappUrl && (
        <p className="text-sm text-muted-foreground">
          Necesitas ayuda?{" "}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Escribenos por WhatsApp
          </a>
        </p>
      )}
    </section>
  )
}
