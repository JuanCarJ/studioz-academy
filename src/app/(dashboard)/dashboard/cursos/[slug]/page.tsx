import { Suspense } from "react"
import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import {
  COURSE_MEDIA_HEALTH_THROTTLE_MS,
  ensureCourseMediaFresh,
  generateSignedUrl,
  resolveLessonAssetState,
  shouldRefreshCourseMediaHealth,
} from "@/lib/bunny"
import { PlayerView } from "@/components/courses/PlayerView"
import { MobileReviewDisclosure } from "@/components/courses/MobileReviewDisclosure"
import { ReviewSection } from "@/components/courses/ReviewSection"

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
  const courseQuery = () =>
    supabase
      .from("courses")
      .select("id, title, slug, thumbnail_url, rating_avg, reviews_count, lessons(*), instructors(id, full_name, slug, avatar_url, specialties)")
      .eq("slug", slug)
      .single()

  // Fetch course + lessons + instructor
  const { data: initialCourse } = await courseQuery()

  let course = initialCourse

  if (!course) redirect("/cursos")
  const courseId = course.id

  const initialLessons = (course.lessons ?? []) as Lesson[]
  const shouldEnsureFreshMedia = shouldRefreshCourseMediaHealth(
    {
      preview_bunny_video_id: null,
      preview_last_checked_at: null,
      preview_status: null,
      pending_preview_bunny_video_id: null,
    },
    initialLessons,
    COURSE_MEDIA_HEALTH_THROTTLE_MS
  )

  if (shouldEnsureFreshMedia) {
    const freshnessResult = await ensureCourseMediaFresh(courseId, {
      source: "dashboard_page",
      throttleMs: COURSE_MEDIA_HEALTH_THROTTLE_MS,
    })

    if (freshnessResult.touchedCourses.some((item) => item.id === courseId)) {
      const { data: refreshedCourse } = await courseQuery()
      if (refreshedCourse) {
        course = refreshedCourse
      }
    }
  }

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

  if (lessons.length === 0) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">{course.title}</h1>
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 py-16 px-6 text-center">
          <h2 className="text-lg font-semibold">Contenido en actualizacion</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">
            Estamos preparando el contenido de este curso. Te notificaremos cuando este listo.
          </p>
        </div>
      </section>
    )
  }

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

  const resumeLessonFromVideoProgress = [...lessons]
    .reverse()
    .find((lesson) => (videoPositionMap.get(lesson.id) ?? 0) > 0)
  const lastLessonExists =
    progress?.last_lesson_id != null &&
    lessons.some((lesson) => lesson.id === progress.last_lesson_id)

  // Determine active lesson (resume from last accessed, or first lesson)
  const activeLessonId =
    (lastLessonExists ? progress?.last_lesson_id : null) ??
    resumeLessonFromVideoProgress?.id ??
    lessons[0]?.id
  const activeLesson = lessons.find((l) => l.id === activeLessonId) ?? lessons[0]

  // Generate signed URL for active lesson
  let initialSignedUrl = ""
  let initialPlaybackMessage = ""
  if (activeLesson) {
    const playbackState = resolveLessonAssetState(activeLesson)
    if (playbackState.isPlayable && playbackState.videoId) {
      initialSignedUrl = generateSignedUrl(playbackState.videoId)
    } else {
      initialPlaybackMessage =
        playbackState.message ?? "El video todavia no esta listo."
    }
  }

  // Restore saved video position for the active lesson (0 if none saved)
  const initialPosition = activeLesson
    ? (videoPositionMap.get(activeLesson.id) ?? 0)
    : 0

  const whatsappNumber =
    process.env.WHATSAPP_NUMBER ?? process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        `Hola, necesito ayuda con el curso ${course.title}`
      )}`
    : null

  const instructor = Array.isArray(course.instructors)
    ? course.instructors[0]
    : course.instructors

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">{course.title}</h1>

      {instructor && (
        <Link
          href={`/instructores/${instructor.slug}`}
          className="inline-flex items-center gap-3 rounded-lg transition-colors hover:bg-muted/50 pr-3"
        >
          <div className="relative h-10 w-10 overflow-hidden rounded-full bg-muted">
            {instructor.avatar_url ? (
              <Image
                src={instructor.avatar_url}
                alt={instructor.full_name}
                fill
                className="object-cover"
                sizes="40px"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                {instructor.full_name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">{instructor.full_name}</p>
            {instructor.specialties?.length > 0 && (
              <p className="truncate text-xs text-muted-foreground">
                {instructor.specialties.join(" · ")}
              </p>
            )}
          </div>
        </Link>
      )}

      <PlayerView
        courseId={course.id}
        courseTitle={course.title}
        lessons={lessons.map((l) => ({
          id: l.id,
          title: l.title,
          durationSeconds: l.duration_seconds,
          isFree: l.is_free,
          isCompleted: completedLessonIds.has(l.id),
        }))}
        activeLessonId={activeLesson?.id ?? ""}
        initialSignedUrl={initialSignedUrl}
        initialPlaybackMessage={initialPlaybackMessage}
        initialPosition={initialPosition}
        thumbnailUrl={course.thumbnail_url}
        supportUrl={whatsappUrl}
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

      <MobileReviewDisclosure>
        <Suspense fallback={<div className="h-32 animate-pulse rounded-lg bg-muted" />}>
          <ReviewSection
            courseId={course.id}
            ratingAvg={course.rating_avg ?? null}
            reviewsCount={course.reviews_count ?? 0}
          />
        </Suspense>
      </MobileReviewDisclosure>
    </section>
  )
}
