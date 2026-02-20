-- Fix infinite recursion in profiles RLS policies.
-- The "Admin reads all profiles" policy does a subquery on profiles within
-- a policy on profiles, causing infinite recursion. Replace with a
-- SECURITY DEFINER function that bypasses RLS.

-- Step 1: Create helper function (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
$$;

-- Restrict to authenticated + service_role only
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- Step 2: Drop all existing SELECT/UPDATE policies on profiles (clean slate)
DROP POLICY IF EXISTS "Admin reads all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

-- Step 3: Recreate clean policies (no self-referencing subqueries)

-- SELECT: users see their own profile
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- SELECT: admins see all profiles (via SECURITY DEFINER function)
CREATE POLICY "Admin reads all profiles" ON public.profiles
  FOR SELECT USING (public.is_admin());

-- UPDATE: users update own profile, cannot change their role
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
