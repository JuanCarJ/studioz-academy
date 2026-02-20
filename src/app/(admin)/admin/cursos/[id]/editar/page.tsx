import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { createServerClient } from "@/lib/supabase/server"
import { getInstructors } from "@/actions/admin/instructors"
import { CourseForm } from "@/components/admin/CourseForm"

import type { Course } from "@/types"

export const metadata = { title: "Editar curso — Admin | Studio Z" }

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerClient()

  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("id", id)
    .single()

  if (!course) redirect("/admin/cursos")

  const instructors = await getInstructors()

  return (
    <section className="space-y-6">
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
    </section>
  )
}
