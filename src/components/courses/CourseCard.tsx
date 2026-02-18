import type { Course } from "@/types"

export function CourseCard({ course }: { course: Course }) {
  return (
    <article className="group overflow-hidden rounded-lg border transition-shadow hover:shadow-md">
      <div className="aspect-video bg-muted" />
      <div className="p-4">
        <h3 className="font-semibold">{course.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{course.shortDescription}</p>
      </div>
    </article>
  )
}
