import type { Metadata } from "next"

import { ThemeSync } from "@/components/layout/ThemeSync"

import "./globals.css"

export const metadata: Metadata = {
  title: "Studio Z Academy",
  description:
    "Academia de baile y estudio de tatuajes en Colombia. Cursos online y presenciales.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es-CO" suppressHydrationWarning>
      <head>
        <script
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
      <body className="font-sans antialiased">
        <ThemeSync />
        {children}
      </body>
    </html>
  )
}
