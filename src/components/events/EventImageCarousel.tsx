"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface EventImageCarouselProps {
  images: Array<{ id: string; image_url: string }>
  title: string
  aspectClassName?: string
}

export function EventImageCarousel({
  images,
  title,
  aspectClassName = "aspect-[16/9]",
}: EventImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  if (images.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-xs uppercase tracking-[0.24em] text-muted-foreground",
          aspectClassName
        )}
      >
        Evento Studio Z
      </div>
    )
  }

  const currentImage = images[Math.min(activeIndex, images.length - 1)] ?? images[0]

  return (
    <div className="relative overflow-hidden">
      <div
        className={cn("bg-cover bg-center", aspectClassName)}
        style={{ backgroundImage: `url("${currentImage.image_url}")` }}
        role="img"
        aria-label={`${title} - imagen ${activeIndex + 1}`}
      />

      {images.length > 1 && (
        <>
          <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/20 bg-black/40 text-white hover:bg-black/60 hover:text-white"
              onClick={() =>
                setActiveIndex((current) =>
                  current === 0 ? images.length - 1 : current - 1
                )
              }
            >
              Anterior
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/20 bg-black/40 text-white hover:bg-black/60 hover:text-white"
              onClick={() =>
                setActiveIndex((current) =>
                  current === images.length - 1 ? 0 : current + 1
                )
              }
            >
              Siguiente
            </Button>
          </div>

          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                aria-label={`Ver imagen ${index + 1} de ${title}`}
                onClick={() => setActiveIndex(index)}
                className={cn(
                  "h-2.5 w-2.5 rounded-full border border-white/60 transition-opacity",
                  index === activeIndex ? "bg-white opacity-100" : "bg-white/30 opacity-70"
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
