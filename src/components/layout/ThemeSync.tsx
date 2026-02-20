"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

export function ThemeSync() {
  const pathname = usePathname()

  useEffect(() => {
    const isAdmin = pathname.startsWith("/admin")
    if (isAdmin) {
      document.documentElement.classList.remove("dark")
    } else {
      document.documentElement.classList.add("dark")
    }
  }, [pathname])

  return null
}
