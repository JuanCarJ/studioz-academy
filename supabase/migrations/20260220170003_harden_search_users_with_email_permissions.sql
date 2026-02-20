-- Harden permissions for search_users_with_email.
-- The function is SECURITY DEFINER and accesses auth.users, so restrict
-- execute to service_role only (used by admin Server Actions).
REVOKE ALL ON FUNCTION public.search_users_with_email(text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_users_with_email(text, int, int) FROM anon;
REVOKE ALL ON FUNCTION public.search_users_with_email(text, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.search_users_with_email(text, int, int) TO service_role;
