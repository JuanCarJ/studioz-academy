-- Local-only candidate; requires account status helpers introduced in 0005.
BEGIN;

-- Preserve the existing anonymization data contract, but do not let an old JWT
-- retain administrative privileges after deletion or suspension of its profile.
CREATE OR REPLACE FUNCTION public.anonymize_user_data(target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
BEGIN
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id is required';
  END IF;
  IF NOT actor_is_service THEN
    IF actor_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;
    -- Serialize authorization with a concurrent account suspension/deletion.
    PERFORM 1 FROM public.profiles WHERE id = actor_id
      AND deleted_at IS NULL AND suspended_at IS NULL FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Active account required' USING ERRCODE = '42501';
    END IF;
    IF actor_id <> target_user_id AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Not authorized to anonymize this user' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.profiles SET
    full_name = 'Usuario eliminado', phone = NULL, avatar_url = NULL,
    deleted_at = now(), updated_at = now()
  WHERE id = target_user_id;
  UPDATE public.orders SET
    customer_name_snapshot = 'Anonimizado', customer_email_snapshot = 'anonimizado',
    customer_phone_snapshot = NULL, updated_at = now()
  WHERE user_id = target_user_id;
  DELETE FROM public.cart_items WHERE user_id = target_user_id;
  DELETE FROM public.course_progress WHERE user_id = target_user_id;
  DELETE FROM public.lesson_progress WHERE user_id = target_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.anonymize_user_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anonymize_user_data(uuid) TO authenticated, service_role;

-- Existing bucket policies use profiles.role without a lifecycle check.
-- A restrictive policy cannot be OR-bypassed by those older permissive policies.
-- Do not affect public reads or uploads to unrelated buckets.
CREATE POLICY active_admin_asset_insert ON storage.objects AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id NOT IN ('course-thumbnails', 'editorial-assets') OR (SELECT public.is_admin()));
CREATE POLICY active_admin_asset_update ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (bucket_id NOT IN ('course-thumbnails', 'editorial-assets') OR (SELECT public.is_admin()))
  WITH CHECK (bucket_id NOT IN ('course-thumbnails', 'editorial-assets') OR (SELECT public.is_admin()));
CREATE POLICY active_admin_asset_delete ON storage.objects AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (bucket_id NOT IN ('course-thumbnails', 'editorial-assets') OR (SELECT public.is_admin()));

COMMIT;
