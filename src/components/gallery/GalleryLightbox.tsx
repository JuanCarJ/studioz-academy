"use client"

import { useState } from "react"
import Image from "next/image"

interface GalleryLightboxProps {
  images: { url: string; alt: string }[]
  initialIndex?: number
}

export function GalleryLightbox({ images, initialIndex = 0 }: GalleryLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [isOpen, setIsOpen] = useState(false)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <button
        onClick={() => setIsOpen(false)}
        className="absolute right-4 top-4 text-white"
      >
        Cerrar
      </button>
      <div className="relative h-[90vh] w-[90vw]">
        <Image
          src={images[currentIndex].url}
          alt={images[currentIndex].alt}
          fill
          sizes="90vw"
          className="object-contain"
          unoptimized
        />
      </div>
      <button
        onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        className="absolute left-4 text-white"
      >
        Anterior
      </button>
      <button
        onClick={() => setCurrentIndex((i) => Math.min(images.length - 1, i + 1))}
        className="absolute right-4 text-white"
      >
        Siguiente
      </button>
    </div>
  )
}
