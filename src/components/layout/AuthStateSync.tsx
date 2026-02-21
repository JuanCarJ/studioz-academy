"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { createBrowserClient } from "@/lib/supabase/client"

interface AuthStateSyncProps {
  isAuthenticated: boolean
}

export function AuthStateSync({ isAuthenticated }: AuthStateSyncProps) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createBrowserClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const hasSession = !!session

      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        (event === "INITIAL_SESSION" && hasSession !== isAuthenticated)
      ) {
        router.refresh()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router, isAuthenticated])

  return null
}
