-- Create a function that joins profiles with auth.users to search by email
-- with server-side pagination. This eliminates the need to fetch all users
-- in memory (listUsers perPage: 10000).
CREATE OR REPLACE FUNCTION public.search_users_with_email(
  search_term text DEFAULT NULL,
  page_offset int DEFAULT 0,
  page_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text,
  role text,
  last_login_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.id,
    p.full_name,
    au.email::text,
    p.phone,
    p.role,
    p.last_login_at,
    p.created_at,
    COUNT(*) OVER() AS total_count
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  WHERE p.deleted_at IS NULL
    AND (
      search_term IS NULL
      OR search_term = ''
      OR p.full_name ILIKE '%' || search_term || '%'
      OR au.email::text ILIKE '%' || search_term || '%'
      OR p.phone ILIKE '%' || search_term || '%'
    )
  ORDER BY p.created_at DESC
  OFFSET page_offset
  LIMIT page_limit
$$;
