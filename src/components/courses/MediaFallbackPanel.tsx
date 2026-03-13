"use client"

import Image from "next/image"
import { MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MediaFallbackPanelProps {
  message: string
  thumbnailUrl?: string | null
  supportUrl?: string | null
  supportLabel?: string
  className?: string
  contentClassName?: string
  title?: string
}

export function MediaFallbackPanel({
  message,
  thumbnailUrl,
  supportUrl,
  supportLabel = "Hablar por WhatsApp",
  className,
  contentClassName,
  title,
}: MediaFallbackPanelProps) {
  return (
    <div
      className={cn(
        "relative flex aspect-video overflow-hidden rounded-xl border bg-muted/30",
        className
      )}
    >
      {thumbnailUrl ? (
        <Image
          src={thumbnailUrl}
          alt={title ?? "Vista previa del curso"}
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 65vw"
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_55%)]" />
      )}

      <div className="absolute inset-0 bg-black/70" />

      <div
        className={cn(
          "relative z-10 flex h-full w-full flex-col items-center justify-center gap-4 p-4 text-center sm:p-6",
          contentClassName
        )}
      >
        {title ? (
          <p className="text-sm font-semibold text-white sm:text-base">{title}</p>
        ) : null}
        <p className="max-w-md text-sm leading-6 text-white/90 sm:text-base">
          {message}
        </p>

        {supportUrl ? (
          <Button asChild variant="secondary" className="min-h-[44px]">
            <a href={supportUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              {supportLabel}
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
