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
  ShoppingBag,
  User,
  LogOut,
} from "lucide-react"

import { LogoutForm } from "@/components/layout/LogoutForm"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"

interface MobileTab {
  href: string
  label: string
  icon: typeof Home
  prefetch?: boolean
}

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

  const tabs: MobileTab[] = [
    { href: "/", label: "Inicio", icon: Home },
    { href: "/cursos", label: "Cursos", icon: GraduationCap },
    isAuthenticated
      ? { href: "/dashboard", label: "Aprendizaje", icon: BookOpen, prefetch: false }
      : { href: "/registro", label: "Registrarse", icon: UserPlus },
    { href: "/carrito", label: "Carrito", icon: ShoppingCart, prefetch: false },
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
              prefetch={tab.prefetch}
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
              aria-label="Abrir menu movil"
              data-testid="mobile-bottom-menu-trigger"
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
              {isAuthenticated && (
                <>
                  <Link
                    href="/dashboard/compras"
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Mis Compras
                  </Link>
                  <Link
                    href="/dashboard/perfil"
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    <User className="h-4 w-4" />
                    Mi Perfil
                  </Link>
                  <LogoutForm
                    className="w-full"
                    buttonClassName="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                    buttonTestId="mobile-logout-button"
                  >
                    <>
                      <LogOut className="h-4 w-4" />
                      Cerrar sesion
                    </>
                  </LogoutForm>
                  <Separator className="my-2" />
                </>
              )}

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
