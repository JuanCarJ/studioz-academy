import { permanentRedirect } from "next/navigation"

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function NoticiaDetailPage({ params }: PageProps) {
  await params
  permanentRedirect("/eventos")
}
