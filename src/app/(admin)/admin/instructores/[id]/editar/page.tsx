import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { getInstructorSpecialtyOptions } from "@/actions/admin/instructors"
import { createServerClient } from "@/lib/supabase/server"
import { InstructorForm } from "@/components/admin/InstructorForm"

import type { Instructor } from "@/types"

export const metadata = { title: "Editar instructor — Admin | Studio Z" }

export default async function EditInstructorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerClient()
  const specialtyOptionsPromise = getInstructorSpecialtyOptions(supabase)

  const { data: instructor } = await supabase
    .from("instructors")
    .select("*")
    .eq("id", id)
    .single()

  if (!instructor) redirect("/admin/instructores")

  const specialtyOptions = await specialtyOptionsPromise

  return (
    <section className="space-y-8">
      <div>
        <Link
          href="/admin/instructores"
          className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Volver a instructores
        </Link>
        <h1 className="text-3xl font-bold">Editar instructor</h1>
        <p className="mt-2 text-muted-foreground">{instructor.full_name}</p>
      </div>

      <InstructorForm
        instructor={instructor as Instructor}
        specialtyOptions={specialtyOptions}
      />
    </section>
  )
}
