export type AuthIntentKind = "add_to_cart" | "enroll_free"

export interface AuthIntent {
  kind: AuthIntentKind
  courseId: string
  redirectTo: string
}

interface ResolveAuthIntentInput {
  redirectTo: string | null
  intent: string | null
  courseId: string | null
  addToCart: string | null
}

function parseIntentKind(value: string | null): AuthIntentKind | null {
  if (value === "add_to_cart" || value === "enroll_free") {
    return value
  }

  return null
}

export function getSafeRedirectPath(redirectTo: string | null): string | null {
  if (!redirectTo || !redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return null
  }

  return redirectTo
}

export function stripAuthIntentParams(path: string | null): string | null {
  const safePath = getSafeRedirectPath(path)
  if (!safePath) return null

  const url = new URL(safePath, "http://localhost")
  url.searchParams.delete("intent")
  url.searchParams.delete("courseId")
  url.searchParams.delete("addToCart")

  return `${url.pathname}${url.search}` || "/"
}

export function resolveAuthIntent(
  input: ResolveAuthIntentInput
): AuthIntent | null {
  const redirectTo = getSafeRedirectPath(input.redirectTo)
  if (!redirectTo) return null

  const intentKind = parseIntentKind(input.intent)
  const courseId = input.courseId?.trim()

  if (intentKind && courseId) {
    return {
      kind: intentKind,
      courseId,
      redirectTo,
    }
  }

  const legacyAddToCartId = input.addToCart?.trim()
  if (!legacyAddToCartId) return null

  return {
    kind: "add_to_cart",
    courseId: legacyAddToCartId,
    redirectTo,
  }
}

export function parseAuthIntentFromFormData(
  formData: FormData,
  redirectTo: string | null
): AuthIntent | null {
  const input = {
    redirectTo,
    intent:
      typeof formData.get("intent") === "string"
        ? (formData.get("intent") as string)
        : null,
    courseId:
      typeof formData.get("courseId") === "string"
        ? (formData.get("courseId") as string)
        : null,
    addToCart:
      typeof formData.get("addToCart") === "string"
        ? (formData.get("addToCart") as string)
        : null,
  }

  const directIntent = resolveAuthIntent(input)
  if (directIntent) return directIntent

  const safeRedirect = getSafeRedirectPath(redirectTo)
  if (!safeRedirect) return null

  const redirectUrl = new URL(safeRedirect, "http://localhost")
  return resolveAuthIntent({
    redirectTo: safeRedirect,
    intent: redirectUrl.searchParams.get("intent"),
    courseId: redirectUrl.searchParams.get("courseId"),
    addToCart: redirectUrl.searchParams.get("addToCart"),
  })
}

export function buildOAuthNextPath(formData: FormData): string {
  const redirectTo = getSafeRedirectPath(formData.get("redirect") as string | null)
  const nextPath = redirectTo ?? "/dashboard"
  const intent = parseAuthIntentFromFormData(formData, redirectTo)

  if (!intent) return nextPath

  const nextUrl = new URL(nextPath, "http://localhost")
  nextUrl.searchParams.set("intent", intent.kind)
  nextUrl.searchParams.set("courseId", intent.courseId)

  if (intent.kind === "add_to_cart") {
    nextUrl.searchParams.set("addToCart", intent.courseId)
  }

  return `${nextUrl.pathname}${nextUrl.search}`
}

export function buildCourseAuthPath(input: {
  slug: string
  intent?: Pick<AuthIntent, "kind" | "courseId">
}): string {
  const params = new URLSearchParams({
    redirect: `/cursos/${input.slug}`,
  })

  if (input.intent) {
    params.set("intent", input.intent.kind)
    params.set("courseId", input.intent.courseId)

    if (input.intent.kind === "add_to_cart") {
      params.set("addToCart", input.intent.courseId)
    }
  }

  return `/login?${params.toString()}`
}
