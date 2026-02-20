import Link from "next/link"

import { CourseCard } from "@/components/courses/CourseCard"

import type { Course, Instructor } from "@/types"

interface CourseGridProps {
  courses: (Course & { instructor?: Pick<Instructor, "id" | "full_name">; isNew?: boolean })[]
}

export function CourseGrid({ courses }: CourseGridProps) {
  if (courses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <svg className="mb-4 h-12 w-12 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <h3 className="text-lg font-semibold">No encontramos cursos</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Intenta con otros filtros o explora todo nuestro catalogo.
        </p>
        <Link
          href="/cursos"
          className="mt-4 text-sm font-medium text-primary hover:underline"
        >
          Ver todos los cursos
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => (
        <CourseCard key={course.id} course={course} />
      ))}
    </div>
  )
}
