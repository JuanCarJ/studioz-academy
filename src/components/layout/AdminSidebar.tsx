"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  GraduationCap,
  DollarSign,
  Users,
  UserCog,
  Star,
  Newspaper,
  CalendarDays,
  Image,
  ClipboardList,
  ExternalLink,
  LogOut,
  Menu,
} from "lucide-react"

import { createBrowserClient } from "@/lib/supabase/client"
import { logout } from "@/actions/auth"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { useCsrfToken } from "@/hooks/use-csrf-token"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet"

const adminLinks = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/cursos", label: "Cursos", icon: GraduationCap },
  { href: "/admin/ventas", label: "Ventas", icon: DollarSign },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users },
  { href: "/admin/instructores", label: "Instructores", icon: UserCog },
  { href: "/admin/resenas", label: "Resenas", icon: Star },
  { href: "/admin/noticias", label: "Noticias", icon: Newspaper },
  { href: "/admin/eventos", label: "Eventos", icon: CalendarDays },
  { href: "/admin/galeria", label: "Galeria", icon: Image },
  { href: "/admin/combos", label: "Combos", icon: ClipboardList },
  { href: "/admin/auditoria", label: "Auditoria", icon: ClipboardList },
]

interface AdminUserInfo {
  fullName: string | null
  email: string | null
}

interface SidebarContentProps {
  csrfToken: string
  userInfo: AdminUserInfo | null
}

function SidebarContent({ csrfToken, userInfo }: SidebarContentProps) {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col">
      <div className="p-4">
        <h2 className="font-heading text-lg font-bold">Studio Z</h2>
        <p className="text-xs text-muted-foreground">Panel de administracion</p>
      </div>

      <Separator />

      <nav className="flex-1 space-y-1 p-2">
        {adminLinks.map((link) => {
          const isActive =
            link.href === "/admin"
              ? pathname === "/admin"
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
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          )
        })}
      </nav>

      <Separator />

      <div className="space-y-1 p-2">
        {userInfo && (
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-xs text-primary">
                {(userInfo.fullName ?? userInfo.email ?? "A")
                  .slice(0, 2)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {userInfo.fullName ?? "Administrador"}
              </p>
              {userInfo.email && (
                <p className="truncate text-xs text-muted-foreground">
                  {userInfo.email}
                </p>
              )}
            </div>
          </div>
        )}
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <ExternalLink className="h-4 w-4" />
          Ver sitio
        </Link>
        <form action={logout}>
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <button
            type="submit"
            disabled={!csrfToken}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesion
          </button>
        </form>
      </div>
    </div>
  )
}

export function AdminSidebar() {
  const { csrfToken } = useCsrfToken()
  const [userInfo, setUserInfo] = useState<AdminUserInfo | null>(null)

  useEffect(() => {
    const supabase = createBrowserClient()

    async function fetchProfile() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      if (authUser) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", authUser.id)
          .single()

        setUserInfo({
          fullName: profile?.full_name ?? null,
          email: authUser.email ?? null,
        })
      }
    }

    fetchProfile()
  }, [])

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 border-r bg-card md:block">
        <SidebarContent csrfToken={csrfToken} userInfo={userInfo} />
      </aside>

      {/* Mobile sheet trigger */}
      <div className="fixed left-4 top-4 z-50 md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon">
              <Menu className="h-4 w-4" />
              <span className="sr-only">Abrir menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">
              Menu de administracion
            </SheetTitle>
            <SidebarContent csrfToken={csrfToken} userInfo={userInfo} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
