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

  // Fetch course + lessons + enrollment in parallel
  const { data: course } = await supabase
    .from("courses")
    .select("id, title, slug, lessons(*)")
    .eq("slug", slug)
    .single()

  if (!course) redirect("/cursos")

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", course.id)
    .maybeSingle()

  if (!enrollment) redirect(`/cursos/${slug}`)

  // Get course progress
  const { data: progress } = await supabase
    .from("course_progress")
    .select("*")
    .eq("user_id", user.id)
    .eq("course_id", course.id)
    .maybeSingle()

  // Get completed lesson IDs
  const lessons = ((course.lessons ?? []) as Lesson[]).sort(
    (a, b) => a.sort_order - b.sort_order
  )
  const lessonIds = lessons.map((l) => l.id)

  const { data: lessonProgressData } = await supabase
    .from("lesson_progress")
    .select("lesson_id, completed")
    .eq("user_id", user.id)
    .in("lesson_id", lessonIds)

  const completedLessonIds = new Set(
    lessonProgressData
      ?.filter((lp) => lp.completed)
      .map((lp) => lp.lesson_id) ?? []
  )

  // Determine active lesson
  const activeLessonId = progress?.last_lesson_id ?? lessons[0]?.id
  const activeLesson = lessons.find((l) => l.id === activeLessonId) ?? lessons[0]

  // Generate signed URL for active lesson
  let initialSignedUrl = ""
  if (activeLesson?.bunny_video_id) {
    initialSignedUrl = generateSignedUrl(activeLesson.bunny_video_id)
  }

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
        courseSlug={course.slug}
        lessons={lessons.map((l) => ({
          id: l.id,
          title: l.title,
          durationSeconds: l.duration_seconds,
          isFree: l.is_free,
          isCompleted: completedLessonIds.has(l.id),
        }))}
        activeLessonId={activeLesson?.id ?? ""}
        initialSignedUrl={initialSignedUrl}
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
