"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Play } from "lucide-react"

import { addToCart } from "@/actions/cart"
import { getSignedVideoUrl } from "@/actions/lessons"
import { buildCourseAuthPath } from "@/lib/auth-intent"
import { getCartErrorMessage } from "@/lib/cart"
import { VideoPlayer } from "@/components/courses/VideoPlayer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface LessonPreviewItem {
  id: string
  title: string
  durationFormatted: string
  isFree: boolean
}

interface FreeLessonPlayerProps {
  courseId: string
  slug: string
  lessons: LessonPreviewItem[]
  isAuthenticated: boolean
  isEnrolled: boolean
  isInCart: boolean
  isFreeCourse: boolean
}

export function FreeLessonPlayer({
  courseId,
  slug,
  lessons,
  isAuthenticated,
  isEnrolled,
  isInCart,
  isFreeCourse,
}: FreeLessonPlayerProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState("")
  const [playerMessage, setPlayerMessage] = useState("")
  const [completionContextLessonId, setCompletionContextLessonId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [cartState, setCartState] = useState(isInCart)
  const [actionError, setActionError] = useState<string | null>(null)

  const freeLessons = lessons.filter((lesson) => lesson.isFree)
  const activeLesson = freeLessons.find((lesson) => lesson.id === activeLessonId) ?? null
  const activeLessonIndex = freeLessons.findIndex((lesson) => lesson.id === activeLessonId)
  const nextFreeLesson =
    activeLessonIndex >= 0 && activeLessonIndex < freeLessons.length - 1
      ? freeLessons[activeLessonIndex + 1]
      : null
  const shouldShowCompletionContext =
    completionContextLessonId != null && completionContextLessonId === activeLessonId
  const shouldOfferUnlock =
    shouldShowCompletionContext &&
    !nextFreeLesson &&
    !isFreeCourse &&
    !isEnrolled

  function requireAuth(options?: { includeAddToCart?: boolean }) {
    router.push(
      buildCourseAuthPath({
        slug,
        intent: options?.includeAddToCart
          ? {
              kind: "add_to_cart",
              courseId,
            }
          : undefined,
      })
    )
  }

  function loadLesson(lessonId: string) {
    setOpen(true)
    setActiveLessonId(lessonId)
    setVideoUrl("")
    setPlayerMessage("")
    setActionError(null)
    setCompletionContextLessonId(null)

    startTransition(async () => {
      const result = await getSignedVideoUrl(lessonId)
      if (result.error) {
        setPlayerMessage(result.error)
        return
      }

      setVideoUrl(result.url)
    })
  }

  function handleVideoEnded() {
    if (!activeLessonId) return
    setCompletionContextLessonId(activeLessonId)
    setActionError(null)
  }

  function handleUnlockCourse() {
    if (cartState) return
    if (!isAuthenticated) {
      requireAuth({ includeAddToCart: true })
      return
    }

    setActionError(null)
    startTransition(async () => {
      const result = await addToCart(courseId)

      if (result.error === "AUTH_REQUIRED") {
        requireAuth({ includeAddToCart: true })
        return
      }

      if (result.error === "ALREADY_IN_CART") {
        setCartState(true)
        router.refresh()
        return
      }

      if (result.error === "ALREADY_ENROLLED") {
        router.push(`/dashboard/cursos/${slug}`)
        return
      }

      if (result.error) {
        setActionError(getCartErrorMessage(result.error))
        return
      }

      setCartState(true)
      router.refresh()
    })
  }

  return (
    <>
      <ul className="divide-y rounded-lg border">
        {lessons.map((lesson, idx) =>
          lesson.isFree ? (
            <li key={lesson.id}>
              <button
                type="button"
                onClick={() => loadLesson(lesson.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-medium">{lesson.title}</span>
                  <Badge variant="secondary" className="text-xs">
                    Gratis
                  </Badge>
                  <Play className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground">
                  {lesson.durationFormatted}
                </span>
              </button>
            </li>
          ) : (
            <li
              key={lesson.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {idx + 1}
                </span>
                <span className="text-sm font-medium">{lesson.title}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {lesson.durationFormatted}
              </span>
            </li>
          )
        )}
      </ul>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) {
            setCompletionContextLessonId(null)
            setActionError(null)
          }
        }}
      >
        <DialogContent className="max-w-3xl overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>{activeLesson?.title ?? "Vista previa gratuita"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 px-6 pb-6">
            {isPending && (
              <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">
                  Cargando video...
                </p>
              </div>
            )}

            {!isPending && playerMessage && (
              <div className="flex aspect-video items-center justify-center rounded-lg bg-destructive/5">
                <p className="text-sm text-destructive">{playerMessage}</p>
              </div>
            )}

            {videoUrl && !isPending && (
              <VideoPlayer signedUrl={videoUrl} onEnded={handleVideoEnded} />
            )}

            {shouldShowCompletionContext && (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {nextFreeLesson
                      ? "Leccion gratuita completada."
                      : shouldOfferUnlock
                        ? "Ya viste todas las lecciones gratuitas."
                        : "Ya terminaste las lecciones disponibles."}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {nextFreeLesson
                      ? `Continua con "${nextFreeLesson.title}".`
                      : shouldOfferUnlock
                        ? "Desbloquea el curso completo para seguir con el resto del contenido."
                        : "No hay mas lecciones disponibles en esta vista previa."}
                  </p>
                </div>

                {actionError && (
                  <p className="text-sm text-destructive">{actionError}</p>
                )}

                {nextFreeLesson ? (
                  <Button
                    onClick={() => loadLesson(nextFreeLesson.id)}
                    disabled={isPending}
                    className="min-h-[44px] w-full sm:w-auto"
                  >
                    Continuar siguiente leccion gratuita
                  </Button>
                ) : shouldOfferUnlock ? (
                  cartState ? (
                    <Button asChild className="min-h-[44px] w-full sm:w-auto">
                      <Link href="/carrito">Ya en tu carrito</Link>
                    </Button>
                  ) : (
                    <Button
                      onClick={handleUnlockCourse}
                      disabled={isPending}
                      className="min-h-[44px] w-full sm:w-auto"
                    >
                      Desbloquear curso completo
                    </Button>
                  )
                ) : (
                  <Badge className="w-fit bg-emerald-600 text-white hover:bg-emerald-600">
                    Vista previa completada
                  </Badge>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
