import { NextRequest, NextResponse } from "next/server"

import {
  CSRF_COOKIE_NAME,
  createCsrfToken,
  getCsrfCookieOptions,
} from "@/lib/security/csrf"

export async function GET(request: NextRequest) {
  const existingToken = request.cookies.get(CSRF_COOKIE_NAME)?.value
  const csrfToken = existingToken ?? createCsrfToken()

  const response = NextResponse.json({ csrfToken })

  if (!existingToken) {
    response.cookies.set(CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions())
  }

  return response
}
