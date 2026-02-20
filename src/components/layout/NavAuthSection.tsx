"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { User, LogOut, LayoutDashboard, Shield, ShoppingBag } from "lucide-react"

import { createBrowserClient } from "@/lib/supabase/client"
import { logout } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useCsrfToken } from "@/hooks/use-csrf-token"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CartIcon } from "@/components/cart/CartIcon"

interface UserInfo {
  id: string
  full_name: string
  role: string
  avatar_url: string | null
}

export function NavAuthSection() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const { csrfToken } = useCsrfToken()

  useEffect(() => {
    const supabase = createBrowserClient()

    async function getUser() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      if (authUser) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, full_name, role, avatar_url")
          .eq("id", authUser.id)
          .single()

        if (profile) {
          setUser(profile)
        }
      }
      setLoading(false)
    }

    getUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null)
      } else {
        getUser()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/login">Iniciar sesion</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/registro">Registrarse</Link>
        </Button>
      </div>
    )
  }

  const initials = user.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex items-center gap-2">
      <CartIcon />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium">{user.full_name}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Mi Aprendizaje
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/compras" className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Mis Compras
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/perfil" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Mi Perfil
            </Link>
          </DropdownMenuItem>
          {user.role === "admin" && (
            <DropdownMenuItem asChild>
              <Link href="/admin" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Panel Admin
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <form action={logout} className="w-full">
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <button
                type="submit"
                disabled={!csrfToken}
                className="flex w-full items-center gap-2 text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesion
              </button>
            </form>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
