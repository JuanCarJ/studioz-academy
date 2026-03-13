"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MobileReviewDisclosureProps {
  children: ReactNode
}

export function MobileReviewDisclosure({
  children,
}: MobileReviewDisclosureProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <section className="space-y-3">
      <Button
        type="button"
        variant="outline"
        className="min-h-[44px] w-full justify-between lg:hidden"
        aria-expanded={isOpen}
        aria-controls="course-mobile-reviews-panel"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span>{isOpen ? "Ocultar reseñas" : "Ver reseñas del curso"}</span>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
        />
      </Button>

      <div
        id="course-mobile-reviews-panel"
        className={cn(isOpen ? "block" : "hidden", "lg:block")}
      >
        {children}
      </div>
    </section>
  )
}
