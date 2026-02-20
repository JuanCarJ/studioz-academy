import Link from "next/link"
import { notFound } from "next/navigation"

import { getUserDetail } from "@/actions/admin/users"
import { UserDetailTabs } from "@/components/admin/UserDetailTabs"
import { Button } from "@/components/ui/button"

export const metadata = { title: "Ficha de usuario — Admin | Studio Z" }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  const { id } = await params

  const detail = await getUserDetail(id)

  if (!detail) {
    notFound()
  }

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{detail.profile.full_name}</h1>
          <p className="mt-1 text-muted-foreground">{detail.profile.email}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/usuarios">Volver al listado</Link>
        </Button>
      </div>

      <UserDetailTabs detail={detail} />
    </section>
  )
}
