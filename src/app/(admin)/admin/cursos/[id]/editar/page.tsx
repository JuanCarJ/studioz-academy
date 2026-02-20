import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { ChevronLeft } from "lucide-react"

import { createServerClient } from "@/lib/supabase/server"
import { getInstructors } from "@/actions/admin/instructors"
import { getLessonsForCourse } from "@/actions/admin/lessons"
import { CourseForm } from "@/components/admin/CourseForm"
import { LessonList } from "@/components/admin/LessonList"
import { AddLessonDialog } from "@/components/admin/AddLessonDialog"
import { Separator } from "@/components/ui/separator"
import { AdminTableSkeleton } from "@/components/skeletons/AdminTableSkeleton"

import type { Course } from "@/types"

export const metadata = { title: "Editar curso — Admin | Studio Z" }

async function LessonsSection({
  courseId,
}: {
  courseId: string
}) {
  const lessons = await getLessonsForCourse(courseId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Lecciones</h2>
          <p className="text-sm text-muted-foreground">
            {lessons.length === 0
              ? "Sin lecciones. Agrega la primera."
              : `${lessons.length} leccion${lessons.length !== 1 ? "es" : ""} en este curso.`}
          </p>
        </div>

        <AddLessonDialog courseId={courseId} />
      </div>

      <LessonList courseId={courseId} initialLessons={lessons} />
    </div>
  )
}

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerClient()

  // Parallel fetch: course + instructors
  const [{ data: course }, instructors] = await Promise.all([
    supabase.from("courses").select("*").eq("id", id).single(),
    getInstructors(),
  ])

  if (!course) redirect("/admin/cursos")

  return (
    <section className="space-y-8">
      <div>
        <Link
          href="/admin/cursos"
          className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Volver a cursos
        </Link>
        <h1 className="text-3xl font-bold">Editar curso</h1>
        <p className="mt-2 text-muted-foreground">{course.title}</p>
      </div>

      <CourseForm
        course={course as Course}
        instructors={instructors.map((i) => ({
          id: i.id,
          full_name: i.full_name,
        }))}
      />

      <Separator />

      <Suspense fallback={<AdminTableSkeleton rows={3} />}>
        <LessonsSection courseId={id} />
      </Suspense>
    </section>
  )
}
