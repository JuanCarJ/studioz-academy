import Link from "next/link"

import { NavAuthSection } from "./NavAuthSection"
import { DesktopNavLinks } from "./DesktopNavLinks"
import { MobileBottomBar } from "./MobileBottomBar"

export function PublicNavbar() {
  return (
    <>
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
            <NavAuthSection />
          </div>
        </nav>
      </header>

      {/* Mobile bottom bar */}
      <MobileBottomBar />
    </>
  )
}
