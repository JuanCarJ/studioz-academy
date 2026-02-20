"use client"

import { useState, useTransition, useRef, useCallback, useEffect } from "react"

import {
  getSignedVideoUrl,
  markComplete,
  markIncomplete,
  saveVideoPosition,
  getLastPosition,
} from "@/actions/lessons"
import { updateLastLesson } from "@/actions/progress"
import { VideoPlayer } from "@/components/courses/VideoPlayer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const SAVE_INTERVAL_MS = 30_000

interface LessonInfo {
  id: string
  title: string
  durationSeconds: number
  isFree: boolean
  isCompleted: boolean
}

interface PlayerViewProps {
  courseId: string
  lessons: LessonInfo[]
  activeLessonId: string
  initialSignedUrl: string
  initialPosition?: number
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

function CheckIcon() {
  return (
    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

export function PlayerView({
  courseId,
  lessons,
  activeLessonId,
  initialSignedUrl,
  initialPosition = 0,
}: PlayerViewProps) {
  const [activeId, setActiveId] = useState(activeLessonId)
  const [signedUrl, setSignedUrl] = useState(initialSignedUrl)
  const [videoPosition, setVideoPosition] = useState(initialPosition)
  const [isPending, startTransition] = useTransition()
  const [completedIds, setCompletedIds] = useState<Set<string>>(
    new Set(lessons.filter((l) => l.isCompleted).map((l) => l.id))
  )

  // Track current playback time — kept in a ref so debounce timer captures latest
  const currentTimeRef = useRef<number>(initialPosition)
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingPositionSave = useRef<boolean>(false)

  // Derived: overall course progress percentage
  const progressPercent =
    lessons.length > 0 ? Math.round((completedIds.size / lessons.length) * 100) : 0

  // ── Position persistence helpers ─────────────────────────────────────────

  const flushPositionSave = useCallback(
    (lessonId: string) => {
      const pos = currentTimeRef.current
      if (pos > 0 && pendingPositionSave.current) {
        pendingPositionSave.current = false
        // Fire-and-forget — do not block UI
        void saveVideoPosition(lessonId, pos)
      }
    },
    []
  )

  // Start the 30-second periodic save for the active lesson
  const startPeriodicSave = useCallback(
    (lessonId: string) => {
      if (saveTimerRef.current !== null) {
        clearInterval(saveTimerRef.current)
      }
      saveTimerRef.current = setInterval(() => {
        flushPositionSave(lessonId)
      }, SAVE_INTERVAL_MS)
    },
    [flushPositionSave]
  )

  const stopPeriodicSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      clearInterval(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }, [])

  // Initialise periodic save for the first lesson on mount
  useEffect(() => {
    startPeriodicSave(activeId)
    return () => {
      stopPeriodicSave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── VideoPlayer callbacks ────────────────────────────────────────────────

  const handleTimeUpdate = useCallback((time: number) => {
    currentTimeRef.current = time
    pendingPositionSave.current = true
  }, [])

  const handleVideoEnded = useCallback(() => {
    // Save final position and mark as completed automatically
    flushPositionSave(activeId)
    startTransition(async () => {
      const result = await markComplete(activeId)
      if (!result.error) {
        setCompletedIds((prev) => new Set([...prev, activeId]))
      }
    })
  }, [activeId, flushPositionSave])

  // ── Lesson navigation ────────────────────────────────────────────────────

  function handleSelectLesson(lessonId: string) {
    if (lessonId === activeId || isPending) return

    // 1. Flush position for the lesson we are leaving
    flushPositionSave(activeId)
    stopPeriodicSave()

    setActiveId(lessonId)

    startTransition(async () => {
      // 2. Fetch new signed URL and saved position in parallel
      const [urlResult, posResult] = await Promise.all([
        getSignedVideoUrl(lessonId),
        getLastPosition(lessonId),
      ])

      if (urlResult.url) {
        setSignedUrl(urlResult.url)
      }
      setVideoPosition(posResult.position)
      currentTimeRef.current = posResult.position
      pendingPositionSave.current = false

      // 3. Record last-accessed lesson in course_progress
      await updateLastLesson(courseId, lessonId)

      // 4. Restart periodic save for the new lesson
      startPeriodicSave(lessonId)
    })
  }

  // ── Complete / Incomplete toggle ─────────────────────────────────────────

  function handleMarkComplete() {
    startTransition(async () => {
      const result = await markComplete(activeId)
      if (!result.error) {
        setCompletedIds((prev) => new Set([...prev, activeId]))
      }
    })
  }

  function handleMarkIncomplete() {
    startTransition(async () => {
      const result = await markIncomplete(activeId)
      if (!result.error) {
        setCompletedIds((prev) => {
          const next = new Set(prev)
          next.delete(activeId)
          return next
        })
      }
    })
  }

  // ── Shared lesson list markup (rendered in sidebar and mobile Sheet) ─────

  const lessonList = (
    <ul className="divide-y overflow-y-auto max-h-[60dvh] lg:max-h-[500px]">
      {lessons.map((lesson, idx) => (
        <li key={lesson.id}>
          <button
            onClick={() => handleSelectLesson(lesson.id)}
            disabled={isPending}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors min-h-[44px] ${
              activeId === lesson.id ? "bg-primary/10" : "hover:bg-muted"
            }`}
          >
            <span
              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs ${
                completedIds.has(lesson.id)
                  ? "bg-green-600 text-white"
                  : "bg-muted"
              }`}
            >
              {completedIds.has(lesson.id) ? <CheckIcon /> : idx + 1}
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
  )

  const lessonPanelHeader = (
    <div className="px-4 py-3 border-b">
      <h3 className="font-semibold">Lecciones</h3>
      <p className="text-xs text-muted-foreground">
        {completedIds.size} de {lessons.length} completadas
      </p>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Course progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progreso del curso</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-green-600 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progreso del curso: ${progressPercent}%`}
          />
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Video column */}
        <div className="lg:col-span-2 space-y-3">
          <VideoPlayer
            signedUrl={signedUrl}
            initialPosition={videoPosition}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleVideoEnded}
          />

          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold truncate">
              {lessons.find((l) => l.id === activeId)?.title ?? ""}
            </h2>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Mobile: toggle lesson list Sheet */}
              <div className="lg:hidden">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-[44px] gap-2"
                      aria-label="Ver lecciones"
                    >
                      <ListIcon />
                      <span className="sr-only sm:not-sr-only">Lecciones</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-full max-w-sm p-0">
                    <SheetHeader className="sr-only">
                      <SheetTitle>Lecciones del curso</SheetTitle>
                    </SheetHeader>
                    {lessonPanelHeader}
                    {lessonList}
                  </SheetContent>
                </Sheet>
              </div>

              {/* Complete / Incomplete toggle */}
              {completedIds.has(activeId) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleMarkIncomplete}
                  disabled={isPending}
                  className="min-h-[44px] text-green-700 hover:text-green-900 gap-1"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Completada
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleMarkComplete}
                  disabled={isPending}
                  className="min-h-[44px]"
                >
                  Marcar como completada
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Lesson list — desktop sidebar (hidden on mobile, handled by Sheet) */}
        <div className="hidden lg:block rounded-lg border">
          {lessonPanelHeader}
          {lessonList}
        </div>
      </div>
    </div>
  )
}
