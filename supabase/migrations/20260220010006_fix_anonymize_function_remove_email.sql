-- R-01: Fix anonymize_user_data — remove reference to non-existent profiles.email column
-- profiles.email does not exist; user email lives in auth.users
CREATE OR REPLACE FUNCTION public.anonymize_user_data(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Anonymize profile
  UPDATE public.profiles
  SET
    full_name = 'Usuario eliminado',
    phone = NULL,
    avatar_url = NULL,
    deleted_at = now(),
    updated_at = now()
  WHERE id = target_user_id;

  -- Anonymize order snapshots (retain orders for tax compliance)
  UPDATE public.orders
  SET
    customer_name_snapshot = 'Anonimizado',
    customer_email_snapshot = 'anonimizado',
    customer_phone_snapshot = NULL,
    updated_at = now()
  WHERE user_id = target_user_id;

  -- Delete user's cart items
  DELETE FROM public.cart_items WHERE user_id = target_user_id;

  -- Delete user's progress data
  DELETE FROM public.course_progress WHERE user_id = target_user_id;
  DELETE FROM public.lesson_progress WHERE user_id = target_user_id;
END;
$$;
