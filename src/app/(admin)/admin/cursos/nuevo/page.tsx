import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { getInstructors } from "@/actions/admin/instructors"
import { CourseForm } from "@/components/admin/CourseForm"

export const metadata = { title: "Crear curso — Admin | Studio Z" }

export default async function NewCoursePage() {
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
        <h1 className="text-3xl font-bold">Crear curso</h1>
        <p className="mt-2 text-muted-foreground">
          Completa la informacion del nuevo curso.
        </p>
      </div>

      <CourseForm
        instructors={instructors.map((i) => ({
          id: i.id,
          full_name: i.full_name,
        }))}
      />
    </section>
  )
}
