"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Script from "next/script"

const PLAYER_JS_SCRIPT_URL =
  "https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js"

interface BunnyTimeUpdatePayload {
  currentTime?: number
  seconds?: number
}

interface PlayerJsInstance {
  on(event: string, handler: (data?: unknown) => void): void
  off?: (event: string, handler: (data?: unknown) => void) => void
  setCurrentTime?: (time: number) => void
}

interface PlayerJsInternalInstance extends PlayerJsInstance {
  elem?: HTMLIFrameElement
  isReady?: boolean
  loaded?: boolean
  queue?: unknown[]
}

type PlayerJsConstructor = new (element: HTMLIFrameElement) => PlayerJsInstance

declare global {
  interface Window {
    playerjs?: {
      Player: PlayerJsConstructor
    }
  }
}

let playerJsPromise: Promise<PlayerJsConstructor> | null = null
let resolvePlayerJs: ((player: PlayerJsConstructor) => void) | null = null
let rejectPlayerJs: ((error: Error) => void) | null = null

function getCurrentTimeFromEvent(data: unknown) {
  if (typeof data === "number") {
    return data
  }

  if (typeof data !== "object" || data === null) {
    return null
  }

  const payload = data as BunnyTimeUpdatePayload
  const currentTime = payload.seconds ?? payload.currentTime
  return typeof currentTime === "number" ? currentTime : null
}

function loadPlayerJs() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Player.js is only available in the browser"))
  }

  if (window.playerjs?.Player) {
    return Promise.resolve(window.playerjs.Player)
  }

  if (playerJsPromise) {
    return playerJsPromise
  }

  playerJsPromise = new Promise<PlayerJsConstructor>((resolve, reject) => {
    resolvePlayerJs = resolve
    rejectPlayerJs = reject
  }).catch((error) => {
    playerJsPromise = null
    throw error
  })

  return playerJsPromise
}

interface VideoPlayerProps {
  signedUrl: string
  initialPosition?: number
  onTimeUpdate?: (currentTime: number) => void
  onPause?: () => void
  onEnded?: () => void
  progressFlushReady?: boolean
}

export function VideoPlayer({
  signedUrl,
  initialPosition = 0,
  onTimeUpdate,
  onPause,
  onEnded,
  progressFlushReady = false,
}: VideoPlayerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const hasSeekedRef = useRef(false)
  const playerRef = useRef<PlayerJsInstance | null>(null)
  const [bridgeFailed, setBridgeFailed] = useState(false)
  const [playbackFailed, setPlaybackFailed] = useState(false)
  const [retry, setRetry] = useState(0)

  const embedUrl = useCallback(() => {
    if (!signedUrl) return ""

    const url = new URL(signedUrl)
    url.searchParams.set("rememberPosition", "false")

    if (initialPosition > 0) {
      url.searchParams.set("t", String(initialPosition))
    } else {
      url.searchParams.delete("t")
    }

    return url.toString()
  }, [initialPosition, signedUrl])

  const seekToInitial = useCallback((player: PlayerJsInstance) => {
    if (initialPosition <= 0 || hasSeekedRef.current) {
      return
    }

    hasSeekedRef.current = true

    if (wrapperRef.current) {
      wrapperRef.current.dataset.lastCommand = "setCurrentTime"
      wrapperRef.current.dataset.lastSeekTime = String(initialPosition)
    }

    try {
      player.setCurrentTime?.(initialPosition)
    } catch {
      hasSeekedRef.current = false
    }
  }, [initialPosition])

  useEffect(() => {
    if (!signedUrl || !iframeRef.current) return

    let cancelled = false
    const readyTimeout = window.setTimeout(() => {
      if (!cancelled) setBridgeFailed(true)
    }, 12_000)
    const wrapper = wrapperRef.current
    const listeners: Array<{ event: string; handler: (data?: unknown) => void }> = []

    hasSeekedRef.current = false
    playerRef.current = null

    if (wrapper) {
      wrapper.dataset.playerApiReady = "false"
      wrapper.dataset.lastPlayerEvent = ""
      wrapper.dataset.currentTime = String(Math.floor(initialPosition))
    }

    function addListener(
      player: PlayerJsInstance,
      event: string,
      handler: (data?: unknown) => void
    ) {
      player.on(event, handler)
      listeners.push({ event, handler })
    }

    void loadPlayerJs()
      .then((Player) => {
        if (cancelled || !iframeRef.current) return

        const player = new Player(iframeRef.current)
        playerRef.current = player

        addListener(player, "ready", () => {
          if (cancelled) return
          window.clearTimeout(readyTimeout)
          setBridgeFailed(false)
          if (wrapper) {
            wrapper.dataset.playerApiReady = "true"
            wrapper.dataset.lastPlayerEvent = "ready"
          }
          seekToInitial(player)
        })

        addListener(player, "play", () => {
          if (wrapper) {
            wrapper.dataset.lastPlayerEvent = "play"
          }
          seekToInitial(player)
        })

        addListener(player, "timeupdate", (data) => {
          const currentTime = getCurrentTimeFromEvent(data)
          if (cancelled || currentTime == null || !Number.isFinite(currentTime) || currentTime < 0) return

          if (wrapper) {
            wrapper.dataset.lastPlayerEvent = "timeupdate"
            wrapper.dataset.currentTime = String(Math.floor(currentTime))
          }

          onTimeUpdate?.(currentTime)
        })

        addListener(player, "pause", () => {
          if (cancelled) return
          if (wrapper) {
            wrapper.dataset.lastPlayerEvent = "pause"
          }
          onPause?.()
        })

        addListener(player, "ended", () => {
          if (cancelled) return
          if (wrapper) {
            wrapper.dataset.lastPlayerEvent = "ended"
          }
          onEnded?.()
        })
        addListener(player, "error", () => {
          if (!cancelled) setPlaybackFailed(true)
        })
      })
      .catch(() => {
        if (cancelled) return
        window.clearTimeout(readyTimeout)
        setBridgeFailed(true)
        if (wrapper) {
          wrapper.dataset.playerApiReady = "false"
        }
      })

    return () => {
      cancelled = true
      window.clearTimeout(readyTimeout)

      if (wrapper) {
        wrapper.dataset.playerApiReady = "false"
      }

      const player = playerRef.current as PlayerJsInternalInstance | null
      if (player) {
        // Bunny's player.js does not expose a destroy method and will try to
        // postMessage during off(). Neutralize the transport before cleanup so
        // internal route changes do not throw against a detached iframe.
        player.loaded = false
        player.isReady = false
        player.queue = []
        player.elem = {
          src: "__disposed__",
          contentWindow: {
            postMessage() {},
          },
        } as unknown as HTMLIFrameElement
      }

      if (player?.off) {
        for (const listener of listeners) {
          try {
            player.off(listener.event, listener.handler)
          } catch {
            // Ignore teardown errors from the third-party player wrapper.
          }
        }
      }

      if (player) {
        player.queue = []
      }

      playerRef.current = null
    }
  }, [initialPosition, onEnded, onPause, onTimeUpdate, seekToInitial, signedUrl, retry])

  if (!signedUrl) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
        <p className="text-muted-foreground">Selecciona una lección para comenzar.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
    <Script src={PLAYER_JS_SCRIPT_URL} strategy="afterInteractive"
      onReady={() => {
        if (window.playerjs?.Player) resolvePlayerJs?.(window.playerjs.Player)
        else rejectPlayerJs?.(new Error("Player script unavailable"))
      }}
      onError={() => rejectPlayerJs?.(new Error("Player script failed"))} />
    <div
      ref={wrapperRef}
      className="aspect-video overflow-hidden rounded-lg bg-black"
      data-testid="course-video-player"
      data-current-time={String(Math.floor(initialPosition))}
      data-last-command=""
      data-last-player-event=""
      data-last-seek-time=""
      data-player-api-ready="false"
      data-progress-flush-ready={progressFlushReady ? "true" : "false"}
    >
      <iframe
        key={`${signedUrl}:${retry}`}
        ref={iframeRef}
        src={embedUrl()}
        className="h-full w-full"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        title="Reproductor del curso"
        onError={() => setPlaybackFailed(true)}
      />
    </div>
    {playbackFailed && <div role="alert" className="text-sm">
      <p>No pudimos reproducir el video. Intenta cargarlo de nuevo.</p>
      <button type="button" className="mt-2 underline underline-offset-4" onClick={() => {
        setPlaybackFailed(false)
        setBridgeFailed(false)
        setRetry((value) => value + 1)
      }}>Reintentar video</button>
    </div>}
    {bridgeFailed && (onTimeUpdate || onPause || onEnded) && <p role="status" className="text-sm text-muted-foreground">
      No pudimos conectar el seguimiento del video. Puedes verlo, pero tu posición podría no guardarse. Actualiza la página para reintentar.
    </p>}
    </div>
  )
}
