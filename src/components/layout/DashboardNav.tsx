"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, ShoppingBag, User } from "lucide-react"

import { cn } from "@/lib/utils"

const dashboardLinks = [
  { href: "/dashboard", label: "Mi Aprendizaje", icon: BookOpen },
  { href: "/dashboard/compras", label: "Mis Compras", icon: ShoppingBag },
  { href: "/dashboard/perfil", label: "Mi Perfil", icon: User },
]

export function DashboardNav() {
  const pathname = usePathname()

  return (
    <nav className="space-y-1 p-4">
      <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Mi cuenta
      </p>
      {dashboardLinks.map((link) => {
        const isActive =
          link.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(link.href)
        const Icon = link.icon

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
