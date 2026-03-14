"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  GraduationCap,
  BookOpen,
  LogIn,
  ShoppingCart,
  Menu,
  ShoppingBag,
  User,
  LogOut,
} from "lucide-react"

import { LogoutForm } from "@/components/layout/LogoutForm"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"

interface MobileTab {
  href: string
  label: string
  icon: typeof Home
  prefetch?: boolean
  testId: string
}

const sheetLinks = [
  { href: "/servicios", label: "Sobre Studio Z" },
  { href: "/galeria", label: "Galeria" },
  { href: "/eventos", label: "Eventos" },
  { href: "/contacto", label: "Contacto" },
]

export function MobileBottomBar({ isAuthenticated }: { isAuthenticated: boolean }) {
  const pathname = usePathname()

  // Hide on admin routes and immersive lesson playback.
  if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard/cursos/")) {
    return null
  }

  const tabs: MobileTab[] = [
    { href: "/", label: "Inicio", icon: Home, testId: "mobile-bottom-tab-home" },
    { href: "/cursos", label: "Cursos", icon: GraduationCap, testId: "mobile-bottom-tab-cursos" },
    isAuthenticated
      ? {
          href: "/dashboard",
          label: "Aprendizaje",
          icon: BookOpen,
          prefetch: false,
          testId: "mobile-bottom-tab-aprendizaje",
        }
      : {
          href: "/login",
          label: "Iniciar sesion",
          icon: LogIn,
          prefetch: false,
          testId: "mobile-bottom-tab-login",
        },
    {
      href: "/carrito",
      label: "Carrito",
      icon: ShoppingCart,
      prefetch: false,
      testId: "mobile-bottom-tab-carrito",
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-lg lg:hidden">
      <div className="grid grid-cols-5 items-stretch gap-1 px-1 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href)
          const showLabel = isActive || (!isAuthenticated && tab.href === "/login")
          const Icon = tab.icon

          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={tab.prefetch}
              data-testid={tab.testId}
              className={cn(
                "flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 text-[10px] leading-tight sm:px-2 sm:text-[11px]",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-5 w-5" />
              <span className={showLabel ? undefined : "sr-only"}>
                {tab.label}
              </span>
            </Link>
          )
        })}

        {/* Menu tab — opens Sheet with remaining links */}
        <Sheet>
          <SheetTrigger asChild>
            <button
              className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 text-[10px] leading-tight text-muted-foreground sm:px-2 sm:text-[11px]"
              aria-label="Abrir menu movil"
              data-testid="mobile-bottom-menu-trigger"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Menu</span>
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader className="gap-1 px-0 pt-0">
              <SheetTitle className="font-heading text-lg font-bold">
                Studio Z
              </SheetTitle>
              <SheetDescription>
                Accesos rapidos del sitio y opciones de cuenta para continuar tu proceso.
              </SheetDescription>
            </SheetHeader>
            <Separator className="my-4" />
            <nav className="flex flex-col gap-1">
              {!isAuthenticated && (
                <>
                  <div className="space-y-2">
                    <Button asChild className="w-full justify-center">
                      <Link href="/login">Iniciar sesion</Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full justify-center">
                      <Link href="/registro">Registrarse</Link>
                    </Button>
                  </div>
                  <Separator className="my-2" />
                </>
              )}

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
