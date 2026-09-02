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
import { resetCourseProgress, updateLastLesson } from "@/actions/progress"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
  isNew?: boolean
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
  initialProgressError?: string
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
  initialProgressError = "",
}: PlayerViewProps) {
  const [activeId, setActiveId] = useState(activeLessonId)
  const [signedUrl, setSignedUrl] = useState(initialSignedUrl)
  const [playerMessage, setPlayerMessage] = useState(initialPlaybackMessage)
  const [videoPosition, setVideoPosition] = useState(initialPosition)
  const [isLoadingLesson, setIsLoadingLesson] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isLessonSheetOpen, setIsLessonSheetOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [progressError, setProgressError] = useState("")
  const [mutationError, setMutationError] = useState("")
  const [completionContextLessonId, setCompletionContextLessonId] = useState<string | null>(null)
  const [completedIds, setCompletedIds] = useState<Set<string>>(
    () => new Set(lessons.filter((lesson) => lesson.isCompleted).map((lesson) => lesson.id))
  )
  const { csrfToken } = useCsrfToken()
  const currentTimeRef = useRef(initialPosition)
  const pendingSaves = useRef(new Map<string, number>())
  const inFlightSaves = useRef(new Map<string, Promise<boolean>>())
  const selectionRequest = useRef(0)
  const mounted = useRef(true)
  const resetting = useRef(false)
  const playerRegionRef = useRef<HTMLDivElement>(null)
  const activeIdRef = useRef(activeLessonId)

  const progressPercent = lessons.length ? Math.round((completedIds.size / lessons.length) * 100) : 0
  const activeLessonIndex = lessons.findIndex((lesson) => lesson.id === activeId)
  const nextLesson = lessons[activeLessonIndex + 1] ?? null
  const nextIncompleteLesson = lessons.find((lesson) => !completedIds.has(lesson.id))
  const courseCompleted = lessons.length > 0 && completedIds.size === lessons.length
  const shouldShowCompletionContext = completionContextLessonId === activeId && completedIds.has(activeId)

  const showSaveError = useCallback(() => {
    if (mounted.current) setProgressError("No pudimos guardar tu avance. Puedes seguir viendo y volver a intentarlo.")
  }, [])

  // Saves retain their own lesson and position. A late response may never mark the
  // newly selected lesson as saved, nor erase a newer position queued for retry.
  const flushPositionSave = useCallback((lessonId: string): Promise<boolean> => {
    const running = inFlightSaves.current.get(lessonId)
    if (running) return running
    const position = pendingSaves.current.get(lessonId)
    if (position === undefined || resetting.current) return Promise.resolve(true)
    const operation = saveVideoPosition(lessonId, position).then((result) => {
      if (result.error) { showSaveError(); return false }
      if (pendingSaves.current.get(lessonId) === position) pendingSaves.current.delete(lessonId)
      return true
    }).catch(() => { showSaveError(); return false }).finally(() => {
      inFlightSaves.current.delete(lessonId)
    })
    inFlightSaves.current.set(lessonId, operation)
    return operation
  }, [showSaveError])

  const flushExitProgress = useCallback(async (reason: "pause" | "logout" | "pagehide", beacon = false) => {
    if (resetting.current) return
    for (const [lessonId, position] of pendingSaves.current) {
      if (!csrfToken) { await flushPositionSave(lessonId); continue }
      const payload = { courseId, lessonId, position, reason, csrfToken }
      try {
        if (beacon && sendVideoProgressFlushBeacon(payload)) continue
        await postVideoProgressFlush(payload, { keepalive: beacon })
        if (pendingSaves.current.get(lessonId) === position) pendingSaves.current.delete(lessonId)
      } catch { showSaveError() }
    }
  }, [courseId, csrfToken, flushPositionSave, showSaveError])
  const exitFlushRef = useRef(flushExitProgress)

  useEffect(() => { exitFlushRef.current = flushExitProgress }, [flushExitProgress])
  useEffect(() => {
    mounted.current = true
    const timer = setInterval(() => {
      for (const lessonId of pendingSaves.current.keys()) void flushPositionSave(lessonId)
    }, SAVE_INTERVAL_MS)
    return () => {
      mounted.current = false
      selectionRequest.current += 1
      clearInterval(timer)
      void exitFlushRef.current("pagehide", true)
    }
  }, [flushPositionSave])
  useEffect(() => registerActiveVideoProgressFlushHandler(() => flushExitProgress("logout")), [flushExitProgress])
  useEffect(() => {
    const onHide = () => { void flushExitProgress("pagehide", true) }
    window.addEventListener("pagehide", onHide)
    return () => window.removeEventListener("pagehide", onHide)
  }, [flushExitProgress])
  useEffect(() => {
    if (!activeLessonId) return
    void updateLastLesson(courseId, activeLessonId).then((result) => {
      if (result.error) showSaveError()
    }).catch(showSaveError)
  }, [courseId, activeLessonId, showSaveError])

  const handleTimeUpdate = useCallback((time: number) => {
    if (resetting.current || !Number.isFinite(time) || time < 0) return
    if (activeId === activeIdRef.current) currentTimeRef.current = time
    pendingSaves.current.set(activeId, Math.floor(time))
  }, [activeId])

  const changeCompletion = useCallback((lessonId: string, complete: boolean) => {
    setMutationError("")
    startTransition(async () => {
      try {
        const result = await (complete ? markComplete(lessonId) : markIncomplete(lessonId))
        if (result.error) { setMutationError(result.error === "AUTH_REQUIRED" ? "Inicia sesión de nuevo para guardar tu progreso." : result.error); return }
        setCompletedIds((previous) => {
          const updated = new Set(previous)
          if (complete) updated.add(lessonId)
          else updated.delete(lessonId)
          return updated
        })
        setCompletionContextLessonId(complete ? lessonId : null)
      } catch {
        setMutationError("No pudimos actualizar esta lección. Vuelve a pulsar el botón para intentarlo.")
      }
    })
  }, [])

  const handleVideoPause = useCallback(() => { void flushPositionSave(activeId) }, [activeId, flushPositionSave])
  const handleVideoEnded = useCallback(() => {
    void flushPositionSave(activeId)
    changeCompletion(activeId, true)
  }, [activeId, flushPositionSave, changeCompletion])

  function loadLesson(lessonId: string) {
    if (!lessons.some((lesson) => lesson.id === lessonId) || resetting.current) return
    void flushPositionSave(activeIdRef.current)
    const requestId = ++selectionRequest.current
    activeIdRef.current = lessonId
    setActiveId(lessonId)
    setSignedUrl("")
    setPlayerMessage("")
    setIsLoadingLesson(true)
    setCompletionContextLessonId(null)
    setMutationError("")
    setIsLessonSheetOpen(false)
    playerRegionRef.current?.focus()
    const isCurrent = () => mounted.current && requestId === selectionRequest.current
    void (async () => {
      try {
        const [urlResult, positionResult] = await Promise.all([
          getSignedVideoUrl(lessonId), getLastPosition(lessonId),
        ])
        if (!isCurrent()) return
        if (positionResult.error && !pendingSaves.current.has(lessonId)) {
          setPlayerMessage("No pudimos recuperar dónde ibas. Vuelve a cargar la lección.")
          setIsLoadingLesson(false)
          return
        }
        setSignedUrl(urlResult.url)
        setPlayerMessage(urlResult.error ?? (urlResult.url ? "" : "No pudimos abrir el video. Inténtalo de nuevo."))
        const position = pendingSaves.current.get(lessonId) ?? positionResult.position
        setVideoPosition(position)
        currentTimeRef.current = position
        setIsLoadingLesson(false)
        const result = await updateLastLesson(courseId, lessonId)
        if (isCurrent() && result.error) showSaveError()
      } catch {
        if (isCurrent()) {
          setPlayerMessage("No pudimos abrir esta lección. Revisa tu conexión y vuelve a intentarlo.")
          setIsLoadingLesson(false)
        }
      }
    })()
  }

  function handleSelectLesson(lessonId: string) {
    if (lessonId === activeId) return
    loadLesson(lessonId)
  }

  function retryProgress() {
    startTransition(async () => {
      try {
        const results = await Promise.all([...pendingSaves.current.keys()].map(flushPositionSave))
        const access = await updateLastLesson(courseId, activeId)
        if (results.every(Boolean) && !access.error) setProgressError("")
        else showSaveError()
      } catch { showSaveError() }
    })
  }

  function handleReset() {
    resetting.current = true
    setIsResetting(true)
    selectionRequest.current += 1
    const previousUrl = signedUrl
    setSignedUrl("")
    setMutationError("")
    startTransition(async () => {
      try {
        await Promise.all([...inFlightSaves.current.values()])
        const result = await resetCourseProgress(courseId, true)
        if (result.error) {
          setMutationError(result.error)
          setSignedUrl(previousUrl)
          return
        }
        pendingSaves.current.clear()
        setCompletedIds(new Set())
        setCompletionContextLessonId(null)
        setProgressError("")
        setResetOpen(false)
        setVideoPosition(0)
        currentTimeRef.current = 0
        resetting.current = false
        if (lessons[0]) loadLesson(lessons[0].id)
      } catch {
        setMutationError("No pudimos reiniciar tu progreso. Inténtalo de nuevo.")
        setSignedUrl(previousUrl)
      } finally {
        resetting.current = false
        setIsResetting(false)
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
            disabled={isResetting}
            aria-current={activeId === lesson.id ? "step" : undefined}
            aria-label={`${idx + 1}. ${lesson.title}${completedIds.has(lesson.id) ? ", completada" : ""}`}
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
                {lesson.isNew && <Badge variant="secondary" className="text-[10px] px-1 py-0">Nuevo</Badge>}
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
      {initialProgressError && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm space-y-2"><p>{initialProgressError}</p><Button variant="outline" onClick={() => window.location.reload()}>Recargar mi progreso</Button></div>}
      {progressError && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm space-y-2"><p>{progressError}</p><Button variant="outline" size="sm" onClick={retryProgress} disabled={isPending}>Volver a guardar</Button></div>}
      {mutationError && !resetOpen && <p role="alert" className="text-sm text-destructive">{mutationError}</p>}
      {/* Course progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progreso del curso</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-green-600 transition-[width] duration-500 motion-reduce:transition-none"
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
            {isLoadingLesson ? (
              <div role="status" className="flex aspect-video items-center justify-center rounded-lg bg-muted text-sm">Cargando lección…</div>
            ) : signedUrl ? (
              <VideoPlayer
                key={activeId}
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
                message={playerMessage || "Selecciona una lección para comenzar."}
                thumbnailUrl={thumbnailUrl}
                supportUrl={supportUrl}
                supportLabel="Necesito ayuda por WhatsApp"
              />
            )}
          </div>

          {!signedUrl && !isLoadingLesson && <Button variant="outline" className="min-h-11" onClick={() => loadLesson(activeId)}>Volver a cargar la lección</Button>}
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
                      <span>Lecciones</span>
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
                  onClick={() => changeCompletion(activeId, false)}
                  aria-label="Marcar esta lección como pendiente"
                  disabled={isPending || isLoadingLesson || Boolean(initialProgressError)}
                  className="min-h-[44px] gap-1 text-green-700 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
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
                  onClick={() => changeCompletion(activeId, true)}
                  disabled={isPending || isLoadingLesson || Boolean(initialProgressError)}
                  className="min-h-[44px] w-full sm:w-auto"
                >
                  Marcar como completada
                </Button>
              )}
            </div>
          </div>

          {(shouldShowCompletionContext || courseCompleted) && (
            <div role="status" className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium">{courseCompleted ? "¡Felicitaciones! Completaste el curso." : "Lección completada."}</p>
              {!courseCompleted && <p className="text-sm text-muted-foreground">{nextLesson ? `Continúa con “${nextLesson.title}”.` : "Todavía tienes lecciones pendientes. Puedes retomarlas cuando quieras."}</p>}
              {!courseCompleted && (nextLesson ?? nextIncompleteLesson) && (
                <Button onClick={() => loadLesson((nextLesson ?? nextIncompleteLesson)!.id)} disabled={isPending || isLoadingLesson} className="min-h-11">
                  {nextLesson ? "Continuar con la siguiente lección" : "Ver lección pendiente"}
                </Button>
              )}
            </div>
          )}
          {!initialProgressError && (completedIds.size > 0 || videoPosition > 0) && (
            <Button variant="ghost" className="min-h-11" onClick={() => setResetOpen(true)} disabled={isPending || isLoadingLesson}>Reiniciar progreso</Button>
          )}

        </div>

        {/* Lesson list — desktop sidebar (hidden on mobile, handled by Sheet) */}
        <div className="hidden lg:block rounded-lg border">
          {lessonPanelHeader}
          {lessonList}
        </div>
      </div>
      <Dialog open={resetOpen} onOpenChange={(open) => { if (!isPending) setResetOpen(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Reiniciar el progreso de este curso?</DialogTitle>
            <DialogDescription>Las lecciones quedarán pendientes y los videos volverán al inicio. Conservarás tu acceso al curso. Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          {mutationError && <p role="alert" className="text-sm text-destructive">{mutationError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={isPending}>Conservar mi progreso</Button>
            <Button onClick={handleReset} disabled={isPending}>{isPending ? "Reiniciando…" : "Sí, reiniciar progreso"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
