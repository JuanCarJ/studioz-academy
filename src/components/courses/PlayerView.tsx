"use client"

import { useState, useTransition } from "react"

import { getSignedVideoUrl, markComplete } from "@/actions/lessons"
import { VideoPlayer } from "@/components/courses/VideoPlayer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface LessonInfo {
  id: string
  title: string
  durationSeconds: number
  isFree: boolean
  isCompleted: boolean
}

interface PlayerViewProps {
  courseSlug: string
  lessons: LessonInfo[]
  activeLessonId: string
  initialSignedUrl: string
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

export function PlayerView({
  lessons,
  activeLessonId,
  initialSignedUrl,
}: PlayerViewProps) {
  const [activeId, setActiveId] = useState(activeLessonId)
  const [signedUrl, setSignedUrl] = useState(initialSignedUrl)
  const [isPending, startTransition] = useTransition()
  const [completedIds, setCompletedIds] = useState<Set<string>>(
    new Set(lessons.filter((l) => l.isCompleted).map((l) => l.id))
  )

  function handleSelectLesson(lessonId: string) {
    if (lessonId === activeId) return

    setActiveId(lessonId)
    startTransition(async () => {
      const result = await getSignedVideoUrl(lessonId)
      if (result.url) {
        setSignedUrl(result.url)
      }
    })
  }

  function handleMarkComplete() {
    startTransition(async () => {
      const result = await markComplete(activeId)
      if (!result.error) {
        setCompletedIds((prev) => new Set([...prev, activeId]))
      }
    })
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Video */}
      <div className="lg:col-span-2 space-y-3">
        <VideoPlayer signedUrl={signedUrl} />

        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            {lessons.find((l) => l.id === activeId)?.title ?? ""}
          </h2>
          {!completedIds.has(activeId) && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleMarkComplete}
              disabled={isPending}
            >
              Marcar como completada
            </Button>
          )}
          {completedIds.has(activeId) && (
            <Badge className="bg-green-600 text-white hover:bg-green-600">
              Completada
            </Badge>
          )}
        </div>
      </div>

      {/* Lesson list */}
      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold">Lecciones</h3>
          <p className="text-xs text-muted-foreground">
            {completedIds.size} de {lessons.length} completadas
          </p>
        </div>

        <ul className="max-h-[500px] divide-y overflow-y-auto">
          {lessons.map((lesson, idx) => (
            <li key={lesson.id}>
              <button
                onClick={() => handleSelectLesson(lesson.id)}
                disabled={isPending}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                  activeId === lesson.id
                    ? "bg-primary/10"
                    : "hover:bg-muted"
                }`}
              >
                <span
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs ${
                    completedIds.has(lesson.id)
                      ? "bg-green-600 text-white"
                      : "bg-muted"
                  }`}
                >
                  {completedIds.has(lesson.id) ? (
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{lesson.title}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDuration(lesson.durationSeconds)}
                    </span>
                    {lesson.isFree && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                        Gratis
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
