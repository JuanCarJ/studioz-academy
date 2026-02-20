"use client"

import { useState, useTransition } from "react"
import { Play } from "lucide-react"

import { getSignedVideoUrl } from "@/actions/lessons"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface FreeLessonPlayerProps {
  lessonId: string
  lessonTitle: string
  lessonIndex: number
  durationFormatted: string
}

export function FreeLessonPlayer({
  lessonId,
  lessonTitle,
  lessonIndex,
  durationFormatted,
}: FreeLessonPlayerProps) {
  const [open, setOpen] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleOpen() {
    setOpen(true)
    setError(null)

    if (videoUrl) return // Already loaded

    startTransition(async () => {
      const result = await getSignedVideoUrl(lessonId)
      if (result.error) {
        setError(result.error)
      } else {
        setVideoUrl(result.url)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {lessonIndex}
          </span>
          <span className="text-sm font-medium">{lessonTitle}</span>
          <Badge variant="secondary" className="text-xs">
            Gratis
          </Badge>
          <Play className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-xs text-muted-foreground">
          {durationFormatted}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>{lessonTitle}</DialogTitle>
          </DialogHeader>

          <div className="px-6 pb-6">
            {isPending && (
              <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">
                  Cargando video...
                </p>
              </div>
            )}

            {error && (
              <div className="flex aspect-video items-center justify-center rounded-lg bg-destructive/5">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {videoUrl && !isPending && (
              <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
                <iframe
                  src={videoUrl}
                  className="absolute inset-0 h-full w-full"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
