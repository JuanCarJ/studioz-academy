-- =============================================================================
-- Migration: 20260220003345_fix_function_search_path
-- Description: Sets search_path = public on all trigger and helper functions.
--              This resolves Supabase security advisor warnings about functions
--              without explicit search_path (which can be exploited via
--              search_path injection if an attacker controls a schema).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- handle_new_user: creates profile on new auth user
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.handle_new_user()
  SET search_path = public;

-- ---------------------------------------------------------------------------
-- set_updated_at: generic updated_at trigger function
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.set_updated_at()
  SET search_path = public;

-- ---------------------------------------------------------------------------
-- refresh_course_rating_stats: recalculates rating_avg and reviews_count
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.refresh_course_rating_stats()
  SET search_path = public;

-- ---------------------------------------------------------------------------
-- is_admin: security-definer helper used in RLS policies
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.is_admin()
  SET search_path = public;

COMMIT;
