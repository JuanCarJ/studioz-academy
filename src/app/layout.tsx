import type { Metadata } from "next"
import { headers } from "next/headers"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google"

import { ThemeSync } from "@/components/layout/ThemeSync"

import "./globals.css"

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
})

export const metadata: Metadata = {
  title: "Studio Z Academy",
  description:
    "Academia de baile y estudio de tatuajes en Colombia. Cursos online y presenciales.",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined
  return (
    <html lang="es-CO" suppressHydrationWarning>
      <head>
        <script
          id="studio-z-theme"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var path = window.location.pathname;
                  if (path.startsWith('/admin')) {
                    document.documentElement.classList.remove('dark');
                  } else {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} font-sans antialiased`}
      >
        <ThemeSync />
        {children}
        <SpeedInsights />
      </body>
    </html>
  )
}
