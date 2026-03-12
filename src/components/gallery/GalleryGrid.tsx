"use client"

import Image from "next/image"
import { useEffect, useMemo, useState } from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface GalleryImage {
  id: string
  url: string
  alt: string
  caption?: string | null
  category?: "baile" | "tatuaje"
}

type GalleryFilter = "all" | "baile" | "tatuaje"

const FILTERS: { value: GalleryFilter; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "baile", label: "Baile" },
  { value: "tatuaje", label: "Tatuaje" },
]

export function GalleryGrid({ images }: { images: GalleryImage[] }) {
  const [activeFilter, setActiveFilter] = useState<GalleryFilter>("all")
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const hasCategories = images.some((image) => image.category)

  const filteredImages = useMemo(() => {
    if (activeFilter === "all") return images
    return images.filter((image) => image.category === activeFilter)
  }, [activeFilter, images])

  useEffect(() => {
    if (selectedIndex == null) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedIndex(null)
      }

      if (event.key === "ArrowRight") {
        setSelectedIndex((current) => {
          if (current == null) return 0
          return Math.min(filteredImages.length - 1, current + 1)
        })
      }

      if (event.key === "ArrowLeft") {
        setSelectedIndex((current) => {
          if (current == null) return 0
          return Math.max(0, current - 1)
        })
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [filteredImages.length, selectedIndex])

  const activeImage =
    selectedIndex != null ? filteredImages[selectedIndex] ?? null : null

  if (images.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed px-6 py-16 text-center text-muted-foreground">
        Aun no hay imagenes publicadas en la galeria.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {hasCategories && (
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              variant={activeFilter === filter.value ? "default" : "outline"}
              onClick={() => {
                setActiveFilter(filter.value)
                setSelectedIndex(null)
              }}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredImages.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setSelectedIndex(index)}
            aria-label={`Abrir imagen: ${image.caption || image.alt}`}
            className="group overflow-hidden rounded-3xl border bg-card text-left transition-[transform,border-color] hover:-translate-y-1 hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="relative aspect-[4/5] w-full overflow-hidden">
              <Image
                src={image.url}
                alt={image.alt}
                fill
                sizes="(min-width: 1024px) 24vw, (min-width: 640px) 48vw, 100vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            </div>
            <div className="space-y-1 px-4 py-4">
              <p className="line-clamp-2 text-sm font-medium">
                {image.caption || image.alt}
              </p>
              {image.category && (
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {image.category}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>

      {activeImage && (
        <div className="fixed inset-0 z-50 bg-black/90 px-4 py-6">
          <div className="mx-auto flex h-full max-w-6xl flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">
                  {activeImage.caption || activeImage.alt}
                </p>
                {activeImage.category && (
                  <p className="text-xs uppercase tracking-[0.24em] text-white/60">
                    {activeImage.category}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedIndex(null)}
                className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                Cerrar
              </Button>
            </div>

            <div className="grid flex-1 gap-4 lg:grid-cols-[80px_minmax(0,1fr)_80px]">
              <div className="hidden items-center lg:flex">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={selectedIndex === 0}
                  onClick={() =>
                    setSelectedIndex((current) =>
                      current == null ? 0 : Math.max(0, current - 1)
                    )
                  }
                  className={cn(
                    "h-16 w-16 rounded-full text-white hover:bg-white/10 hover:text-white",
                    selectedIndex === 0 && "opacity-40"
                  )}
                >
                  Anterior
                </Button>
              </div>

              <div className="relative min-h-[50vh] overflow-hidden rounded-3xl">
                <Image
                  src={activeImage.url}
                  alt={activeImage.alt}
                  fill
                  sizes="100vw"
                  className="object-contain"
                />
              </div>

              <div className="hidden items-center justify-end lg:flex">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={selectedIndex === filteredImages.length - 1}
                  onClick={() =>
                    setSelectedIndex((current) =>
                      current == null
                        ? 0
                        : Math.min(filteredImages.length - 1, current + 1)
                    )
                  }
                  className={cn(
                    "h-16 w-16 rounded-full text-white hover:bg-white/10 hover:text-white",
                    selectedIndex === filteredImages.length - 1 && "opacity-40"
                  )}
                >
                  Siguiente
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between lg:hidden">
              <Button
                type="button"
                variant="outline"
                disabled={selectedIndex === 0}
                onClick={() =>
                  setSelectedIndex((current) =>
                    current == null ? 0 : Math.max(0, current - 1)
                  )
                }
                className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={selectedIndex === filteredImages.length - 1}
                onClick={() =>
                  setSelectedIndex((current) =>
                    current == null
                      ? 0
                      : Math.min(filteredImages.length - 1, current + 1)
                  )
                }
                className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                Siguiente
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
