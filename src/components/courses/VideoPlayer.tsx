"use client"

export function VideoPlayer({ signedUrl }: { signedUrl: string }) {
  if (!signedUrl) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
        <p className="text-muted-foreground">Selecciona una lección para comenzar.</p>
      </div>
    )
  }

  return (
    <div className="aspect-video overflow-hidden rounded-lg bg-black">
      <iframe
        src={signedUrl}
        className="h-full w-full"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}
