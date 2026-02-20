import { Suspense } from "react"
import Image from "next/image"
import { notFound } from "next/navigation"

import type { Metadata } from "next"

import { getInstructorBySlug, getInstructorCourses } from "@/actions/instructors"
import { CourseGrid } from "@/components/courses/CourseGrid"
import { CoursesSkeleton } from "@/components/skeletons/CoursesSkeleton"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const instructor = await getInstructorBySlug(slug)

  if (!instructor) return { title: "Instructor no encontrado" }

  return {
    title: `${instructor.full_name} — Studio Z Academy`,
    description:
      instructor.bio?.slice(0, 160) ??
      `Perfil del instructor ${instructor.full_name} en Studio Z Academy.`,
  }
}

async function InstructorCourses({ instructorId }: { instructorId: string }) {
  const courses = await getInstructorCourses(instructorId)
  return <CourseGrid courses={courses} />
}

export default async function InstructorProfilePage({ params }: PageProps) {
  const { slug } = await params

  const instructor = await getInstructorBySlug(slug)

  if (!instructor) notFound()

  return (
    <section className="container mx-auto px-4 py-16">
      {/* Profile header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10">
        {/* Avatar */}
        <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-border">
          {instructor.avatar_url ? (
            <Image
              src={instructor.avatar_url}
              alt={instructor.full_name}
              fill
              priority
              className="object-cover"
              sizes="128px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-muted-foreground uppercase">
              {instructor.full_name[0]}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-3xl font-bold">{instructor.full_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {instructor.years_experience != null && (
                <span>
                  {instructor.years_experience}{" "}
                  {instructor.years_experience === 1 ? "ano" : "anos"} de experiencia
                </span>
              )}
              {instructor.publishedCoursesCount > 0 && (
                <span>
                  {instructor.publishedCoursesCount}{" "}
                  {instructor.publishedCoursesCount === 1 ? "curso" : "cursos"} publicados
                </span>
              )}
            </div>
          </div>

          {instructor.specialties.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {instructor.specialties.map((specialty) => (
                <Badge key={specialty} variant="secondary">
                  {specialty}
                </Badge>
              ))}
            </div>
          )}

          {instructor.bio && (
            <p className="text-muted-foreground leading-relaxed max-w-2xl">
              {instructor.bio}
            </p>
          )}
        </div>
      </div>

      <Separator className="my-12" />

      {/* Courses */}
      <div>
        <h2 className="mb-6 text-xl font-bold">
          Cursos de {instructor.full_name}
        </h2>
        <Suspense fallback={<CoursesSkeleton />}>
          <InstructorCourses instructorId={instructor.id} />
        </Suspense>
      </div>
    </section>
  )
}
