"use client"

import dynamic from "next/dynamic"

const VideoPlayer = dynamic(
  () =>
    import("@/components/courses/VideoPlayer").then((m) => ({
      default: m.VideoPlayer,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
        <p className="text-muted-foreground">Cargando video...</p>
      </div>
    ),
  }
)

export function PreviewPlayer({ url }: { url: string }) {
  return <VideoPlayer signedUrl={url} />
}
