"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { User, LogOut, LayoutDashboard, Shield, ShoppingBag, BookOpen } from "lucide-react"

import { subscribeToCartCountUpdated } from "@/lib/cart-events"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LogoutForm } from "@/components/layout/LogoutForm"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CartIcon } from "@/components/cart/CartIcon"

interface NavAuthSectionProps {
  user: {
    id: string
    full_name: string
    role: string
    avatar_url: string | null
  } | null
  cartCount: number
}

function useCartCountState(cartCount: number) {
  const [localCartCount, setLocalCartCount] = useState(cartCount)

  useEffect(() => {
    setLocalCartCount(cartCount)
  }, [cartCount])

  useEffect(() => {
    return subscribeToCartCountUpdated((nextCount) => {
      setLocalCartCount(nextCount)
    })
  }, [])

  return localCartCount
}

function UserMenuItems({
  user,
}: {
  user: NonNullable<NavAuthSectionProps["user"]>
}) {
  return (
    <>
      <div className="px-2 py-1.5">
        <p className="text-sm font-medium">{user.full_name}</p>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href="/dashboard" prefetch={false} className="flex items-center gap-2">
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
        <LogoutForm
          className="w-full"
          buttonClassName="flex w-full items-center gap-2 text-destructive"
          buttonTestId="logout-button"
        >
          <>
            <LogOut className="h-4 w-4" />
            Cerrar sesion
          </>
        </LogoutForm>
      </DropdownMenuItem>
    </>
  )
}

function UserMenuTrigger({
  user,
  className,
  testId,
}: {
  user: NonNullable<NavAuthSectionProps["user"]>
  className?: string
  testId?: string
}) {
  const initials = user.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className ?? "rounded-full"}
          aria-label="Abrir menu de usuario"
          data-testid={testId}
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatar_url ?? undefined} alt={user.full_name} />
            <AvatarFallback className="bg-primary text-xs text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <UserMenuItems user={user} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function NavAuthSection({ user, cartCount }: NavAuthSectionProps) {
  const localCartCount = useCartCountState(cartCount)

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="darkOutline"
          size="sm"
          asChild
          className="rounded-full border-white/16 bg-white/[0.03] px-4 text-white/90 hover:border-white/28 hover:bg-white/[0.08]"
        >
          <Link href="/login">Iniciar sesion</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/registro">Registrarse</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
        <Link href="/dashboard">
          <BookOpen className="mr-1.5 h-4 w-4" />
          Mi Aprendizaje
        </Link>
      </Button>
      <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
        <Link href="/dashboard/compras">
          <ShoppingBag className="mr-1.5 h-4 w-4" />
          Mis Compras
        </Link>
      </Button>
      <CartIcon itemCount={localCartCount} />
      <UserMenuTrigger user={user} />
    </div>
  )
}

export function MobileNavAuthSection({ user, cartCount }: NavAuthSectionProps) {
  const localCartCount = useCartCountState(cartCount)

  if (!user) {
    return null
  }

  return (
    <div className="flex items-center gap-1 md:hidden">
      <CartIcon itemCount={localCartCount} />
      <UserMenuTrigger
        user={user}
        className="rounded-full"
        testId="mobile-header-user-menu-trigger"
      />
    </div>
  )
}
