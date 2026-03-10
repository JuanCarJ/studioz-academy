import { Suspense } from "react"
import { notFound, permanentRedirect } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Users, BookOpen, Clock, CheckCircle } from "lucide-react"

import type { Metadata } from "next"

import { getCourseBySlug, getRelatedCourses } from "@/actions/courses"
import { getCurrentUser } from "@/lib/supabase/auth"
import { isPromotionalFreeCourse } from "@/lib/pricing"
import { createServerClient } from "@/lib/supabase/server"
import { CourseActions } from "@/components/courses/CourseActions"
import { CourseGrid } from "@/components/courses/CourseGrid"
import { FreeLessonPlayer } from "@/components/courses/FreeLessonPlayer"
import { CoursesSkeleton } from "@/components/skeletons/CoursesSkeleton"
import { PreviewPlayer } from "@/components/courses/PreviewPlayer"
import { ReviewSection } from "@/components/courses/ReviewSection"
import { StarRating } from "@/components/courses/StarRating"
import { MobileStickyPurchase } from "@/components/courses/MobileStickyPurchase"
import { Badge } from "@/components/ui/badge"

import type { ResolvedCoursePreview } from "@/lib/bunny"
import type { CourseActionsProps } from "@/components/courses/CourseActions"

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

function HeroMedia({
  preview,
  thumbnailUrl,
  title,
}: {
  preview: ResolvedCoursePreview
  thumbnailUrl: string | null
  title: string
}) {
  if (preview.isPlayable && preview.url) {
    return (
      <div className="aspect-video overflow-hidden rounded-xl bg-black">
        <PreviewPlayer url={preview.url} />
      </div>
    )
  }

  if (preview.kind !== "none") {
    return (
      <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
        {thumbnailUrl && (
          <Image
            src={thumbnailUrl}
            alt={title}
            fill
            priority
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 65vw"
            unoptimized
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <p className="max-w-sm px-4 text-center text-sm text-white">
            {preview.message ??
              "La vista previa no esta disponible en este momento."}
          </p>
        </div>
      </div>
    )
  }

  if (thumbnailUrl) {
    return (
      <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
        <Image
          src={thumbnailUrl}
          alt={title}
          fill
          priority
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 65vw"
          unoptimized
        />
      </div>
    )
  }

  return (
    <div className="flex aspect-video items-center justify-center rounded-xl bg-muted">
      <svg
        className="h-16 w-16 text-muted-foreground/40"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
        />
      </svg>
    </div>
  )
}

export default async function CourseDetailPage({ params }: PageProps) {
  const { slug } = await params

  const course = await getCourseBySlug(slug)

  if (!course) {
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
  const isPromoFree = isPromotionalFreeCourse({
    is_free: course.is_free,
    current_price: course.current_price,
    has_course_discount: course.has_course_discount,
  })

  const courseActionsProps: CourseActionsProps = {
    courseId: course.id,
    slug: course.slug,
    isFree: course.is_free || course.current_price === 0,
    isEnrolled: course.isEnrolled,
    isInCart: course.isInCart,
    price: course.current_price,
    listPrice: course.list_price,
    coursePromotionLabel: course.course_discount_label,
    isAuthenticated: !!user,
    enrollmentProgress: course.enrollmentProgress,
  }

  return (
    <section className="container mx-auto px-4 py-8 lg:py-12">
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-[1fr_340px]">
        {/* Hero video */}
        <div className="order-1">
          <HeroMedia
            preview={course.resolvedPreview}
            thumbnailUrl={course.thumbnail_url}
            title={course.title}
          />
        </div>

        {/* Purchase card — sidebar on desktop, inline on mobile */}
        <div className="order-3 lg:order-none lg:col-start-2 lg:row-span-4 lg:row-start-1">
          <MobileStickyPurchase
            stickyChildren={
              <div className="flex items-center justify-between gap-4">
                <p className="min-w-0 truncate text-sm font-medium">
                  {course.title}
                </p>
                <div className="flex-shrink-0">
                  <CourseActions {...courseActionsProps} compact />
                </div>
              </div>
            }
          >
            <div className="space-y-5 rounded-xl border bg-card p-6 lg:sticky lg:top-20">
              <CourseActions {...courseActionsProps} />

              {/* Rating in sidebar */}
              {course.reviews_count > 0 && course.rating_avg != null && (
                <div className="flex items-center gap-2">
                  <StarRating
                    value={course.rating_avg}
                    mode="display"
                    size="sm"
                  />
                  <span className="text-sm font-medium">
                    {course.rating_avg.toFixed(1)}
                  </span>
                  <a
                    href="#resenas"
                    className="text-sm text-muted-foreground hover:text-primary"
                  >
                    ({course.reviews_count}{" "}
                    {course.reviews_count === 1 ? "reseña" : "reseñas"})
                  </a>
                </div>
              )}

              {/* Stats */}
              <div className="space-y-3 border-t pt-4 text-sm text-muted-foreground">
                {course.lessonsCount > 0 && (
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    <span>{course.lessonsCount} lecciones</span>
                  </div>
                )}
                {course.totalDuration > 0 && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>{formatDuration(course.totalDuration)}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>{course.enrollmentCount} estudiantes</span>
                </div>
                {!course.isEnrolled && !course.is_free && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    <span>Acceso de por vida</span>
                  </div>
                )}
              </div>
            </div>
          </MobileStickyPurchase>
        </div>

        {/* Meta bar — badges, title, social proof */}
        <div className="order-2 space-y-3 lg:order-none">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {course.category === "baile" ? "Baile" : "Tatuaje"}
            </Badge>
            {course.is_free && (
              <Badge className="bg-green-600 text-white hover:bg-green-600">
                Gratis
              </Badge>
            )}
            {!course.is_free && course.has_course_discount && course.course_discount_label && (
              <Badge className="bg-amber-500 text-black hover:bg-amber-500">
                {course.course_discount_label}
              </Badge>
            )}
          </div>

          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {course.title}
          </h1>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
            {course.reviews_count > 0 && course.rating_avg != null && (
              <div className="flex items-center gap-1.5">
                <StarRating
                  value={course.rating_avg}
                  mode="display"
                  size="sm"
                />
                <span className="font-medium text-foreground">
                  {course.rating_avg.toFixed(1)}
                </span>
                <a href="#resenas" className="hover:text-primary">
                  ({course.reviews_count})
                </a>
              </div>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {course.enrollmentCount} estudiantes
            </span>
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
          </div>
          {!course.is_free && (
            <p className="text-sm text-muted-foreground">
              {isPromoFree
                ? "Esta promocion te da acceso inmediato. Los combos se calculan automaticamente cuando el total del carrito es mayor a cero."
                : "Los combos se calculan automaticamente en el carrito."}
            </p>
          )}
        </div>

        {/* Content: description, temario, instructor */}
        <div className="order-4 space-y-10 lg:order-none">
          {/* Description */}
          {(course.short_description || course.description) && (
            <div className="space-y-4">
              {course.short_description && (
                <p className="text-base leading-relaxed text-muted-foreground lg:text-lg">
                  {course.short_description}
                </p>
              )}
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
            </div>
          )}

          {/* Temario */}
          {course.lessons.length > 0 && (
            <div>
              <h2 className="mb-3 text-xl font-bold">Temario</h2>
              <FreeLessonPlayer
                courseId={course.id}
                slug={course.slug}
                lessons={course.lessons.map((lesson) => ({
                  id: lesson.id,
                  title: lesson.title,
                  durationFormatted: formatDuration(lesson.duration_seconds),
                  isFree: lesson.is_free,
                }))}
                isAuthenticated={!!user}
                isEnrolled={course.isEnrolled}
                isInCart={course.isInCart}
                isFreeCourse={course.is_free}
              />
            </div>
          )}

          {/* Instructor */}
          {course.instructor && (
            <div className="rounded-xl border bg-card p-6">
              <h2 className="mb-4 text-lg font-bold">Instructor</h2>
              <div className="flex gap-4">
                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                  {course.instructor.avatar_url ? (
                    <Image
                      src={course.instructor.avatar_url}
                      alt={course.instructor.full_name}
                      fill
                      className="object-cover"
                      sizes="80px"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground">
                      {course.instructor.full_name[0]}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {course.instructor.slug ? (
                    <Link
                      href={`/instructores/${course.instructor.slug}`}
                      className="block text-base font-semibold transition-colors hover:text-primary"
                    >
                      {course.instructor.full_name}
                    </Link>
                  ) : (
                    <p className="text-base font-semibold">
                      {course.instructor.full_name}
                    </p>
                  )}
                  {course.instructor.specialties?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {course.instructor.specialties.map((spec) => (
                        <Badge
                          key={spec}
                          variant="secondary"
                          className="text-xs"
                        >
                          {spec}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {course.instructor.years_experience != null && (
                    <p className="text-sm text-muted-foreground">
                      {course.instructor.years_experience} anos de experiencia
                    </p>
                  )}
                  {course.instructor.bio && (
                    <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">
                      {course.instructor.bio}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reviews — full width */}
      <div className="mt-16" id="resenas">
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

      {/* Related courses — full width */}
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
