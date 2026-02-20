import { Suspense } from "react"
import { notFound, permanentRedirect } from "next/navigation"
import Image from "next/image"
import Link from "next/link"

import type { Metadata } from "next"

import { getCourseBySlug, getRelatedCourses } from "@/actions/courses"
import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { CourseActions } from "@/components/courses/CourseActions"
import { CourseGrid } from "@/components/courses/CourseGrid"
import { FreeLessonPlayer } from "@/components/courses/FreeLessonPlayer"
import { CoursesSkeleton } from "@/components/skeletons/CoursesSkeleton"
import { PreviewPlayer } from "@/components/courses/PreviewPlayer"
import { ReviewSection } from "@/components/courses/ReviewSection"
import { Badge } from "@/components/ui/badge"

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params
  const course = await getCourseBySlug(slug)

  if (!course) return { title: "Curso no encontrado" }

  return {
    title: `${course.title} — Studio Z Academy`,
    description:
      course.short_description ?? course.description?.slice(0, 160) ?? "",
    openGraph: {
      title: course.title,
      description: course.short_description ?? "",
      ...(course.thumbnail_url && { images: [course.thumbnail_url] }),
    },
  }
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes} min`
}

async function RelatedCourses({
  courseId,
  category,
  instructorId,
}: {
  courseId: string
  category: string
  instructorId: string
}) {
  const related = await getRelatedCourses(courseId, category, instructorId, 3)
  if (related.length === 0) return null

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Cursos relacionados</h2>
      <CourseGrid courses={related} />
    </div>
  )
}

export default async function CourseDetailPage({ params }: PageProps) {
  const { slug } = await params

  const course = await getCourseBySlug(slug)

  if (!course) {
    // H-06: Check slug_redirects before returning 404
    const supabase = await createServerClient()
    const { data: slugRedirect } = await supabase
      .from("slug_redirects")
      .select("new_slug")
      .eq("old_slug", slug)
      .eq("entity_type", "course")
      .maybeSingle()

    if (slugRedirect) {
      permanentRedirect(`/cursos/${slugRedirect.new_slug}`)
    }

    notFound()
  }

  const user = await getCurrentUser()

  return (
    <section className="container mx-auto px-4 py-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Hero / Thumbnail */}
          <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
            {course.thumbnail_url ? (
              <Image
                src={course.thumbnail_url}
                alt={course.title}
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 66vw"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                Sin imagen
              </div>
            )}
          </div>

          {/* Title area */}
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge variant="secondary">
                {course.category === "baile" ? "Baile" : "Tatuaje"}
              </Badge>
              {course.is_free && (
                <Badge className="bg-green-600 text-white hover:bg-green-600">
                  Gratis
                </Badge>
              )}
            </div>

            <h1 className="text-3xl font-bold">{course.title}</h1>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {course.instructor.slug ? (
                <Link
                  href={`/instructores/${course.instructor.slug}`}
                  className="transition-colors hover:text-primary"
                >
                  Por {course.instructor.full_name}
                </Link>
              ) : (
                <span>Por {course.instructor.full_name}</span>
              )}
              <span>{course.enrollmentCount} estudiantes</span>
              {course.lessonsCount > 0 && (
                <span>
                  {course.lessonsCount} lecciones -{" "}
                  {formatDuration(course.totalDuration)}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {course.description && (
            <div>
              <h2 className="mb-3 text-xl font-bold">Descripcion</h2>
              <div className="prose prose-sm max-w-none text-muted-foreground">
                {course.description.split("\n").map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </div>
          )}

          {/* Temario / lessons */}
          {course.lessons.length > 0 && (
            <div>
              <h2 className="mb-3 text-xl font-bold">Temario</h2>
              <ul className="divide-y rounded-lg border">
                {course.lessons.map((lesson, idx) =>
                  lesson.is_free ? (
                    <li key={lesson.id}>
                      <FreeLessonPlayer
                        lessonId={lesson.id}
                        lessonTitle={lesson.title}
                        lessonIndex={idx + 1}
                        durationFormatted={formatDuration(
                          lesson.duration_seconds
                        )}
                      />
                    </li>
                  ) : (
                    <li
                      key={lesson.id}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
                          {idx + 1}
                        </span>
                        <span className="text-sm font-medium">
                          {lesson.title}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(lesson.duration_seconds)}
                      </span>
                    </li>
                  )
                )}
              </ul>
            </div>
          )}

          {/* Preview video */}
          {course.preview_video_url && (
            <div>
              <h2 className="mb-3 text-xl font-bold">Vista previa</h2>
              <PreviewPlayer url={course.preview_video_url} />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-6 rounded-lg border p-6">
            <CourseActions
              courseId={course.id}
              slug={course.slug}
              isFree={course.is_free}
              isEnrolled={course.isEnrolled}
              isInCart={course.isInCart}
              price={course.price}
              isAuthenticated={!!user}
            />

            {/* Stats */}
            <div className="space-y-3 border-t pt-4 text-sm text-muted-foreground">
              {course.lessonsCount > 0 && (
                <div className="flex justify-between">
                  <span>Lecciones</span>
                  <span className="font-medium text-foreground">
                    {course.lessonsCount}
                  </span>
                </div>
              )}
              {course.totalDuration > 0 && (
                <div className="flex justify-between">
                  <span>Duracion total</span>
                  <span className="font-medium text-foreground">
                    {formatDuration(course.totalDuration)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Estudiantes</span>
                <span className="font-medium text-foreground">
                  {course.enrollmentCount}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reviews */}
      <div className="mt-16">
        <Suspense
          fallback={
            <div className="space-y-4">
              <div className="h-6 w-32 animate-pulse rounded bg-muted" />
              <div className="h-24 animate-pulse rounded-lg bg-muted" />
            </div>
          }
        >
          <ReviewSection
            courseId={course.id}
            ratingAvg={course.rating_avg}
            reviewsCount={course.reviews_count}
          />
        </Suspense>
      </div>

      {/* Related courses */}
      <div className="mt-16">
        <Suspense fallback={<CoursesSkeleton />}>
          <RelatedCourses
            courseId={course.id}
            category={course.category}
            instructorId={course.instructor_id}
          />
        </Suspense>
      </div>
    </section>
  )
}
