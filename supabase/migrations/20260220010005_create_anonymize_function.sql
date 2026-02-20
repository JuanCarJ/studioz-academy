-- H-11: Function to anonymize user data for Habeas Data compliance
-- Retains order data (anonymized) for 5-year Colombian tax retention requirement
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
    email = 'deleted-' || target_user_id::text || '@anon',
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
