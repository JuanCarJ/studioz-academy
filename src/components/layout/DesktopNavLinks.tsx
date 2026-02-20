"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const navLinks = [
  { href: "/cursos", label: "Cursos" },
  { href: "/servicios", label: "Servicios" },
  { href: "/galeria", label: "Galeria" },
  { href: "/noticias", label: "Noticias" },
  { href: "/eventos", label: "Eventos" },
  { href: "/contacto", label: "Contacto" },
]

export function DesktopNavLinks() {
  const pathname = usePathname()

  return (
    <div className="hidden items-center gap-6 md:flex">
      {navLinks.map((link) => {
        const isActive =
          pathname === link.href || pathname.startsWith(link.href + "/")

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "text-sm transition-colors",
              isActive
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        )
      })}
    </div>
  )
}
