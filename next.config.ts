import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // Admin lesson uploads submit the selected file in a Server Action form.
    // The Bunny integration suite uses a 163 MB fixture, so both the Server
    // Action parser and the proxy buffering limit must accept bodies above 1 MB.
    proxyClientMaxBodySize: "200mb",
    serverActions: {
      bodySizeLimit: "200mb",
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
}

export default nextConfig
