"use client"

import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

interface MobileStickyPurchaseProps {
  children: ReactNode
  stickyChildren: ReactNode
}

export function MobileStickyPurchase({
  children,
  stickyChildren,
}: MobileStickyPurchaseProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [showSticky, setShowSticky] = useState(false)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => setShowSticky(!entry.isIntersecting),
      { threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div ref={sentinelRef}>{children}</div>
      {showSticky && (
        <div className="fixed bottom-16 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur-lg md:bottom-0 lg:hidden">
          <div className="container mx-auto px-4 py-3">
            {stickyChildren}
          </div>
        </div>
      )}
    </>
  )
}
