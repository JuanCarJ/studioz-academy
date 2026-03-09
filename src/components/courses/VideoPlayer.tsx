"use client"

import { useCallback, useEffect, useRef } from "react"

const PLAYER_JS_SCRIPT_URL =
  "https://assets.mediadelivery.net/playerjs/playerjs-latest.min.js"

interface BunnyTimeUpdatePayload {
  currentTime?: number
  seconds?: number
}

interface PlayerJsInstance {
  on(event: string, handler: (data?: unknown) => void): void
  off?: (event: string, handler: (data?: unknown) => void) => void
  setCurrentTime?: (time: number) => void
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
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${PLAYER_JS_SCRIPT_URL}"]`
    )

    function resolvePlayer() {
      if (window.playerjs?.Player) {
        resolve(window.playerjs.Player)
        return true
      }

      return false
    }

    function handleLoad() {
      if (!resolvePlayer()) {
        reject(new Error("Bunny player.js loaded without exposing window.playerjs.Player"))
      }
    }

    function handleError() {
      reject(new Error("Failed to load Bunny player.js"))
    }

    if (existingScript) {
      if (resolvePlayer()) {
        return
      }

      existingScript.addEventListener("load", handleLoad, { once: true })
      existingScript.addEventListener("error", handleError, { once: true })
      return
    }

    const script = document.createElement("script")
    script.src = PLAYER_JS_SCRIPT_URL
    script.async = true
    script.addEventListener("load", handleLoad, { once: true })
    script.addEventListener("error", handleError, { once: true })
    document.head.appendChild(script)
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

        if (wrapper) {
          wrapper.dataset.playerApiReady = "true"
        }

        addListener(player, "ready", () => {
          if (wrapper) {
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
          if (currentTime == null) return

          if (wrapper) {
            wrapper.dataset.lastPlayerEvent = "timeupdate"
            wrapper.dataset.currentTime = String(Math.floor(currentTime))
          }

          onTimeUpdate?.(currentTime)
        })

        addListener(player, "pause", () => {
          if (wrapper) {
            wrapper.dataset.lastPlayerEvent = "pause"
          }
          onPause?.()
        })

        addListener(player, "ended", () => {
          if (wrapper) {
            wrapper.dataset.lastPlayerEvent = "ended"
          }
          onEnded?.()
        })
      })
      .catch(() => {
        if (wrapper) {
          wrapper.dataset.playerApiReady = "false"
        }
      })

    return () => {
      cancelled = true

      if (wrapper) {
        wrapper.dataset.playerApiReady = "false"
      }

      const player = playerRef.current
      if (player?.off) {
        for (const listener of listeners) {
          player.off(listener.event, listener.handler)
        }
      }

      playerRef.current = null
    }
  }, [initialPosition, onEnded, onPause, onTimeUpdate, seekToInitial, signedUrl])

  if (!signedUrl) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
        <p className="text-muted-foreground">Selecciona una lección para comenzar.</p>
      </div>
    )
  }

  return (
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
        ref={iframeRef}
        src={embedUrl()}
        className="h-full w-full"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        title="Reproductor del curso"
      />
    </div>
  )
}
