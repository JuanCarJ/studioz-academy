"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  GraduationCap,
  BookOpen,
  UserPlus,
  ShoppingCart,
  Menu,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"

const sheetLinks = [
  { href: "/servicios", label: "Servicios" },
  { href: "/galeria", label: "Galeria" },
  { href: "/noticias", label: "Noticias" },
  { href: "/eventos", label: "Eventos" },
  { href: "/contacto", label: "Contacto" },
]

export function MobileBottomBar({ isAuthenticated }: { isAuthenticated: boolean }) {
  const pathname = usePathname()

  // Hide on admin routes
  if (pathname.startsWith("/admin")) return null

  const tabs = [
    { href: "/", label: "Inicio", icon: Home },
    { href: "/cursos", label: "Cursos", icon: GraduationCap },
    isAuthenticated
      ? { href: "/dashboard", label: "Aprendizaje", icon: BookOpen }
      : { href: "/registro", label: "Registrarse", icon: UserPlus },
    { href: "/carrito", label: "Carrito", icon: ShoppingCart },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-lg md:hidden">
      <div className="flex items-center justify-around py-2">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href)
          const Icon = tab.icon

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-1 text-[10px]",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {tab.label}
            </Link>
          )
        })}

        {/* Menu tab — opens Sheet with remaining links */}
        <Sheet>
          <SheetTrigger asChild>
            <button
              className="flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] text-muted-foreground"
            >
              <Menu className="h-5 w-5" />
              Menu
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetTitle className="font-heading text-lg font-bold">
              Studio Z
            </SheetTitle>
            <Separator className="my-4" />
            <nav className="flex flex-col gap-1">
              {sheetLinks.map((link) => {
                const isActive =
                  link.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(link.href)

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    {link.label}
                  </Link>
                )
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  )
}
