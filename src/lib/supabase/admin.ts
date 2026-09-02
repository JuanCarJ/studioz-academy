import { createClient } from "@supabase/supabase-js"
import "server-only"
import { env } from "@/lib/env"

import type { Database } from "@/types/database"

export function createServiceRoleClient() {
  return createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_ROLE_KEY(),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
