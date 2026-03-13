"use client"

import { useState, useTransition, useRef, useCallback, useEffect } from "react"

import {
  getSignedVideoUrl,
  markComplete,
  markIncomplete,
  saveVideoPosition,
  getLastPosition,
} from "@/actions/lessons"
import { MediaFallbackPanel } from "@/components/courses/MediaFallbackPanel"
import { updateLastLesson } from "@/actions/progress"
import { VideoPlayer } from "@/components/courses/VideoPlayer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useCsrfToken } from "@/hooks/use-csrf-token"
import {
  postVideoProgressFlush,
  registerActiveVideoProgressFlushHandler,
  sendVideoProgressFlushBeacon,
} from "@/lib/video-progress-client"
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
  courseTitle: string
  lessons: LessonInfo[]
  activeLessonId: string
  initialSignedUrl: string
  initialPlaybackMessage?: string
  initialPosition?: number
  thumbnailUrl?: string | null
  supportUrl?: string | null
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
  courseTitle,
  lessons,
  activeLessonId,
  initialSignedUrl,
  initialPlaybackMessage = "",
  initialPosition = 0,
  thumbnailUrl,
  supportUrl,
}: PlayerViewProps) {
  const [activeId, setActiveId] = useState(activeLessonId)
  const [signedUrl, setSignedUrl] = useState(initialSignedUrl)
  const [playerMessage, setPlayerMessage] = useState(initialPlaybackMessage)
  const [videoPosition, setVideoPosition] = useState(initialPosition)
  const [isPending, startTransition] = useTransition()
  const [isLessonSheetOpen, setIsLessonSheetOpen] = useState(false)
  const { csrfToken } = useCsrfToken()
  const [completionContextLessonId, setCompletionContextLessonId] = useState<string | null>(null)
  const [completedIds, setCompletedIds] = useState<Set<string>>(
    new Set(lessons.filter((l) => l.isCompleted).map((l) => l.id))
  )

  // Track current playback time — kept in a ref so debounce timer captures latest
  const currentTimeRef = useRef<number>(initialPosition)
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingPositionSave = useRef<boolean>(false)
  const playerRegionRef = useRef<HTMLDivElement>(null)
  const flushExitProgressRef = useRef<
    (reason: "pause" | "logout" | "pagehide", transport?: "fetch" | "beacon") => Promise<void>
  >(async () => {})

  // Derived: overall course progress percentage
  const progressPercent =
    lessons.length > 0 ? Math.round((completedIds.size / lessons.length) * 100) : 0
  const activeLessonIndex = lessons.findIndex((lesson) => lesson.id === activeId)
  const nextLesson =
    activeLessonIndex >= 0 && activeLessonIndex < lessons.length - 1
      ? lessons[activeLessonIndex + 1]
      : null
  const isSingleLessonCourse = lessons.length === 1
  const shouldShowCompletionContext =
    completionContextLessonId === activeId && completedIds.has(activeId)

  // ── Position persistence helpers ─────────────────────────────────────────

  const flushPositionSave = useCallback(
    (lessonId: string) => {
      const pos = Math.floor(currentTimeRef.current)
      if (pos > 0 && pendingPositionSave.current) {
        pendingPositionSave.current = false
        // Fire-and-forget — do not block UI, but preserve the pending flag on failure.
        void saveVideoPosition(lessonId, pos)
          .then((result) => {
            if (result.error) {
              pendingPositionSave.current = true
            }
          })
          .catch(() => {
            pendingPositionSave.current = true
          })
      }
    },
    []
  )

  const flushExitProgress = useCallback(
    async (reason: "pause" | "logout" | "pagehide", transport: "fetch" | "beacon" = "fetch") => {
      if (!signedUrl || !csrfToken || !pendingPositionSave.current) return

      const position = Math.floor(currentTimeRef.current)
      if (position <= 0) {
        pendingPositionSave.current = false
        return
      }

      pendingPositionSave.current = false

      const payload = {
        courseId,
        lessonId: activeId,
        position,
        reason,
        csrfToken,
      }

      try {
        if (transport === "beacon") {
          const beaconSent = sendVideoProgressFlushBeacon(payload)
          if (beaconSent) {
            return
          }
        }

        await postVideoProgressFlush(payload, {
          keepalive: transport === "beacon",
        })
      } catch {
        pendingPositionSave.current = true
      }
    },
    [activeId, courseId, csrfToken, signedUrl]
  )

  useEffect(() => {
    flushExitProgressRef.current = flushExitProgress
  }, [flushExitProgress])

  const flushPauseProgress = useCallback(async () => {
    if (!signedUrl || !pendingPositionSave.current) return

    const position = Math.floor(currentTimeRef.current)
    if (position <= 0) {
      pendingPositionSave.current = false
      return
    }

    pendingPositionSave.current = false

    try {
      const result = await saveVideoPosition(activeId, position)
      if (result.error) {
        pendingPositionSave.current = true
      }
    } catch {
      pendingPositionSave.current = true
    }
  }, [activeId, signedUrl])

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

  useEffect(() => {
    return registerActiveVideoProgressFlushHandler(() => flushExitProgress("logout"))
  }, [flushExitProgress])

  useEffect(() => {
    function handlePageHide() {
      void flushExitProgress("pagehide", "beacon")
    }

    window.addEventListener("pagehide", handlePageHide)
    return () => {
      window.removeEventListener("pagehide", handlePageHide)
    }
  }, [flushExitProgress])

  useEffect(() => {
    return () => {
      void flushExitProgressRef.current("pagehide")
    }
  }, [])

  // ── VideoPlayer callbacks ────────────────────────────────────────────────

  const handleTimeUpdate = useCallback((time: number) => {
    currentTimeRef.current = time
    pendingPositionSave.current = true
  }, [])

  const handleVideoPause = useCallback(() => {
    void flushPauseProgress()
  }, [flushPauseProgress])

  const handleVideoEnded = useCallback(() => {
    // Save final position and mark as completed automatically
    flushPositionSave(activeId)
    startTransition(async () => {
      const result = await markComplete(activeId)
      if (!result.error) {
        setCompletedIds((prev) => new Set([...prev, activeId]))
        setCompletionContextLessonId(activeId)
      }
    })
  }, [activeId, flushPositionSave])

  // ── Lesson navigation ────────────────────────────────────────────────────

  function loadLesson(lessonId: string) {
    // 1. Flush position for the lesson we are leaving
    flushPositionSave(activeId)
    stopPeriodicSave()
    setCompletionContextLessonId(null)
    setIsLessonSheetOpen(false)

    setActiveId(lessonId)
    playerRegionRef.current?.focus()
    playerRegionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })

    startTransition(async () => {
      // 2. Fetch new signed URL and saved position in parallel
      const [urlResult, posResult] = await Promise.all([
        getSignedVideoUrl(lessonId),
        getLastPosition(lessonId),
      ])

      if (urlResult.url) {
        setSignedUrl(urlResult.url)
        setPlayerMessage("")
      } else {
        setSignedUrl("")
        setPlayerMessage(urlResult.error ?? "El video no esta disponible.")
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

  function handleSelectLesson(lessonId: string) {
    if (lessonId === activeId || isPending) return
    loadLesson(lessonId)
  }

  // ── Complete / Incomplete toggle ─────────────────────────────────────────

  function handleMarkComplete() {
    startTransition(async () => {
      const result = await markComplete(activeId)
      if (!result.error) {
        setCompletedIds((prev) => new Set([...prev, activeId]))
        setCompletionContextLessonId(activeId)
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
        setCompletionContextLessonId(null)
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
            className={`flex w-full items-start gap-3 px-4 py-3 text-left text-sm transition-colors min-h-[44px] ${
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
        <div className="space-y-3 lg:col-span-2">
          <div ref={playerRegionRef} tabIndex={-1} className="space-y-3 outline-none">
            {signedUrl ? (
              <VideoPlayer
                signedUrl={signedUrl}
                initialPosition={videoPosition}
                onTimeUpdate={handleTimeUpdate}
                onPause={handleVideoPause}
                onEnded={handleVideoEnded}
                progressFlushReady={Boolean(csrfToken)}
              />
            ) : (
              <MediaFallbackPanel
                title={courseTitle}
                message={playerMessage || "Selecciona una leccion para comenzar."}
                thumbnailUrl={thumbnailUrl}
                supportUrl={supportUrl}
                supportLabel="Necesito ayuda por WhatsApp"
              />
            )}
          </div>

          <div className="space-y-3 sm:flex sm:items-start sm:justify-between sm:gap-3 sm:space-y-0">
            <h2 className="text-base font-semibold leading-6 sm:text-lg">
              {lessons.find((l) => l.id === activeId)?.title ?? ""}
            </h2>

            <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
              {/* Mobile: toggle lesson list Sheet */}
              <div className="lg:hidden">
                <Sheet open={isLessonSheetOpen} onOpenChange={setIsLessonSheetOpen}>
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
                      <SheetDescription>
                        Abre el listado compacto de lecciones y cambia de video sin salir del reproductor.
                      </SheetDescription>
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
                  className="min-h-[44px] gap-1 text-green-700 hover:text-green-900"
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
                  className="min-h-[44px] w-full sm:w-auto"
                >
                  Marcar como completada
                </Button>
              )}
            </div>
          </div>

          {shouldShowCompletionContext && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {nextLesson
                      ? "Leccion completada."
                      : isSingleLessonCourse
                        ? "Curso completado."
                        : "Terminaste la ultima leccion del curso."}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {nextLesson
                      ? `Continua con "${nextLesson.title}".`
                      : "Ya no quedan mas lecciones por completar."}
                  </p>
                </div>

                {nextLesson ? (
                  <Button
                    onClick={() => loadLesson(nextLesson.id)}
                    disabled={isPending}
                    className="min-h-[44px] w-full sm:w-auto"
                  >
                    Continuar siguiente leccion
                  </Button>
                ) : (
                  <Badge className="w-fit bg-emerald-600 text-white hover:bg-emerald-600">
                    Curso completado
                  </Badge>
                )}
              </div>
            </div>
          )}
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
