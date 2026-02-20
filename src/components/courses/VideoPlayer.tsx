"use client"

import { useEffect, useRef, useCallback } from "react"

interface BunnyTimeUpdateMessage {
  event: "timeupdate"
  data: { currentTime: number }
}

interface BunnyPlayerMessage {
  event: string
  data?: unknown
}

interface VideoPlayerProps {
  signedUrl: string
  initialPosition?: number
  onTimeUpdate?: (currentTime: number) => void
  onEnded?: () => void
}

export function VideoPlayer({
  signedUrl,
  initialPosition = 0,
  onTimeUpdate,
  onEnded,
}: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const hasSeekededRef = useRef(false)
  const isReadyRef = useRef(false)

  // Send a postMessage to the Bunny iframe safely
  const sendToPlayer = useCallback((message: Record<string, unknown>) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify(message), "*")
    } catch {
      // Silently ignore: cross-origin or iframe not mounted
    }
  }, [])

  // Seek to initialPosition once the player is ready
  const seekToInitial = useCallback(() => {
    if (initialPosition > 0 && !hasSeekededRef.current) {
      hasSeekededRef.current = true
      sendToPlayer({ event: "seek", data: { time: initialPosition } })
    }
  }, [initialPosition, sendToPlayer])

  // Listen for postMessage events from the Bunny iframe
  useEffect(() => {
    if (!signedUrl) return

    // Reset seek state when URL changes
    hasSeekededRef.current = false
    isReadyRef.current = false

    function handleMessage(event: MessageEvent) {
      // Accept messages only — no origin check possible with Bunny signed URLs
      let parsed: BunnyPlayerMessage | null = null

      try {
        if (typeof event.data === "string") {
          parsed = JSON.parse(event.data) as BunnyPlayerMessage
        } else if (typeof event.data === "object" && event.data !== null) {
          parsed = event.data as BunnyPlayerMessage
        }
      } catch {
        return
      }

      if (!parsed) return

      switch (parsed.event) {
        case "ready":
        case "playing": {
          if (!isReadyRef.current) {
            isReadyRef.current = true
            seekToInitial()
          }
          break
        }
        case "timeupdate": {
          const msg = parsed as BunnyTimeUpdateMessage
          const currentTime = msg.data?.currentTime
          if (typeof currentTime === "number") {
            onTimeUpdate?.(currentTime)
          }
          break
        }
        case "ended": {
          onEnded?.()
          break
        }
        default:
          break
      }
    }

    window.addEventListener("message", handleMessage)
    return () => {
      window.removeEventListener("message", handleMessage)
    }
  }, [signedUrl, seekToInitial, onTimeUpdate, onEnded])

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
        ref={iframeRef}
        src={signedUrl}
        className="h-full w-full"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}
