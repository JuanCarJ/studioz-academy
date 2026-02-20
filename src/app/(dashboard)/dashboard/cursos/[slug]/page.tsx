import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"

export default async function CoursePlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const supabase = await createServerClient()

  // Fetch course by slug
  const { data: course } = await supabase
    .from("courses")
    .select("id, title")
    .eq("slug", slug)
    .maybeSingle()

  if (!course) redirect("/cursos")

  // Check active enrollment
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", course.id)
    .maybeSingle()

  if (!enrollment) redirect(`/cursos/${slug}`)

  return (
    <section>
      <h1 className="text-3xl font-bold">{course.title}</h1>
      <p className="mt-2 text-muted-foreground">Curso: {slug}</p>
      {/* TODO: VideoPlayer + LessonList (Increment 2/4) */}
    </section>
  )
}
