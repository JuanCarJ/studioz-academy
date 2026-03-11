import type { SupabaseClient } from "@supabase/supabase-js"

import {
  addCourseToCartForUser,
  resolvePostAddToCartRedirect,
} from "@/lib/cart"
import { stripAuthIntentParams, type AuthIntent } from "@/lib/auth-intent"
import {
  enrollFreeCourseForUser,
  resolvePostEnrollFreeRedirect,
} from "@/lib/enrollments"

import type { Database } from "@/types/database"

type RlsClient = SupabaseClient<Database>

export async function resolvePostAuthIntentRedirect(input: {
  supabase: RlsClient
  userId: string
  intent: AuthIntent
  fallbackPath: string
}): Promise<string> {
  const sanitizedRedirect =
    stripAuthIntentParams(input.intent.redirectTo) ?? input.fallbackPath

  switch (input.intent.kind) {
    case "add_to_cart": {
      const result = await addCourseToCartForUser({
        supabase: input.supabase,
        userId: input.userId,
        courseId: input.intent.courseId,
      })

      return resolvePostAddToCartRedirect({
        result,
        redirectTo: sanitizedRedirect,
        fallbackPath: input.fallbackPath,
      })
    }
    case "enroll_free": {
      const result = await enrollFreeCourseForUser({
        supabase: input.supabase,
        userId: input.userId,
        courseId: input.intent.courseId,
      })

      return resolvePostEnrollFreeRedirect({
        result,
        redirectTo: sanitizedRedirect,
        fallbackPath: input.fallbackPath,
      })
    }
  }
}
