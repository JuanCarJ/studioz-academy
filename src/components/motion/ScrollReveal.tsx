"use client"

export function ScrollReveal({ children }: { children: React.ReactNode }) {
  return (
    <div className="motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out">
      {children}
    </div>
  )
}
