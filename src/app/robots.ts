import type { MetadataRoute } from "next"

import { env } from "@/lib/env"

export default function robots(): MetadataRoute.Robots {
  const baseUrl = env.APP_URL()

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/dashboard", "/api"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
