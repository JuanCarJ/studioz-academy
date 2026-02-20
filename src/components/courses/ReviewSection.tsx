import Image from "next/image"

import { getCourseReviews, getUserReviewForCourse } from "@/actions/reviews"
import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { ReviewForm } from "@/components/courses/ReviewForm"
import { StarRating } from "@/components/courses/StarRating"
import { Separator } from "@/components/ui/separator"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

interface ReviewSectionProps {
  courseId: string
  ratingAvg: number | null
  reviewsCount: number
}

export async function ReviewSection({
  courseId,
  ratingAvg,
  reviewsCount,
}: ReviewSectionProps) {
  const [user, reviews] = await Promise.all([
    getCurrentUser(),
    getCourseReviews(courseId),
  ])

  // Check enrollment (needed to decide whether to show the form)
  let isEnrolled = false
  let existingReview = null

  if (user) {
    const supabase = await createServerClient()
    const [enrollmentCheck] = await Promise.all([
      supabase
        .from("enrollments")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .maybeSingle(),
    ])
    isEnrolled = !!enrollmentCheck.data

    if (isEnrolled) {
      existingReview = await getUserReviewForCourse(courseId)
    }
  }

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-bold">Resenas</h2>

      {/* Summary */}
      {reviewsCount > 0 && ratingAvg != null && (
        <div className="flex items-center gap-4">
          <span className="text-4xl font-bold">{ratingAvg.toFixed(1)}</span>
          <div className="space-y-1">
            <StarRating value={ratingAvg} mode="display" size="md" />
            <p className="text-sm text-muted-foreground">
              {reviewsCount} {reviewsCount === 1 ? "resena" : "resenas"}
            </p>
          </div>
        </div>
      )}

      {reviewsCount === 0 && (
        <p className="text-sm text-muted-foreground">
          Este curso aun no tiene resenas. Se el primero en opinar.
        </p>
      )}

      {/* Review form or CTA */}
      {user && isEnrolled ? (
        <ReviewForm courseId={courseId} existingReview={existingReview} />
      ) : !user ? (
        <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
          <a href="/login" className="text-primary hover:underline">
            Inicia sesion
          </a>{" "}
          y compra este curso para dejar tu resena.
        </div>
      ) : (
        // Authenticated but not enrolled
        <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
          Compra este curso para dejar tu resena.
        </div>
      )}

      {/* Reviews list */}
      {reviews.length > 0 && (
        <div className="space-y-4">
          <Separator />
          {reviews.map((review) => (
            <article key={review.id} className="space-y-2">
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
                  {review.user?.avatar_url ? (
                    <Image
                      src={review.user.avatar_url}
                      alt={review.user.full_name}
                      fill
                      className="object-cover"
                      sizes="36px"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground uppercase">
                      {(review.user?.full_name ?? "?")[0]}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">
                      {review.user?.full_name ?? "Usuario"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(review.created_at)}
                    </span>
                  </div>
                  <StarRating value={review.rating} mode="display" size="sm" />
                  {review.text && (
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                      {review.text}
                    </p>
                  )}
                </div>
              </div>
              <Separator />
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
