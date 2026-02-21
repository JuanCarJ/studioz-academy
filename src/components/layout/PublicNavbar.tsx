import Link from "next/link"

import { getCurrentUser } from "@/lib/supabase/auth"
import { createServerClient } from "@/lib/supabase/server"
import { AuthStateSync } from "./AuthStateSync"
import { NavAuthSection } from "./NavAuthSection"
import { DesktopNavLinks } from "./DesktopNavLinks"
import { MobileBottomBar } from "./MobileBottomBar"

export async function PublicNavbar() {
  const user = await getCurrentUser()

  let cartCount = 0
  if (user) {
    const supabase = await createServerClient()
    const { count } = await supabase
      .from("cart_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
    cartCount = count ?? 0
  }

  return (
    <>
      <AuthStateSync isAuthenticated={!!user} />
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
        <nav className="container mx-auto flex h-16 items-center justify-center px-4 md:justify-between">
          {/* Logo — centered on mobile, start-aligned on desktop */}
          <Link
            href="/"
            className="font-heading text-lg font-bold tracking-tight"
          >
            Studio Z
          </Link>

          {/* Desktop nav links (client component with active highlighting) */}
          <DesktopNavLinks />

          {/* Right section: Auth (includes CartIcon when authenticated) — desktop only */}
          <div className="hidden items-center gap-2 md:flex">
            <NavAuthSection
              user={
                user
                  ? {
                      id: user.id,
                      full_name: user.full_name,
                      role: user.role,
                      avatar_url: user.avatar_url,
                    }
                  : null
              }
              cartCount={cartCount}
            />
          </div>
        </nav>
      </header>

      {/* Mobile bottom bar */}
      <MobileBottomBar isAuthenticated={!!user} />
    </>
  )
}
