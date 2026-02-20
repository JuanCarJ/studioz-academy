-- R-02 + R-05:
-- 1) Allow unknown mapped_status in payment_events for traceability of unmapped gateways statuses.
-- 2) Harden anonymize_user_data with actor authorization and explicit EXECUTE grants.

BEGIN;

ALTER TABLE public.payment_events
  DROP CONSTRAINT IF EXISTS payment_events_source_check;

ALTER TABLE public.payment_events
  ADD CONSTRAINT payment_events_source_check CHECK (
    source IN ('webhook', 'polling', 'reconciliation', 'manual')
  );

ALTER TABLE public.payment_events
  DROP CONSTRAINT IF EXISTS payment_events_mapped_status_check;

ALTER TABLE public.payment_events
  ADD CONSTRAINT payment_events_mapped_status_check CHECK (
    mapped_status IN (
      'pending',
      'approved',
      'declined',
      'voided',
      'refunded',
      'chargeback',
      'unknown'
    )
  );

CREATE OR REPLACE FUNCTION public.anonymize_user_data(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid;
  actor_role text;
  actor_is_admin boolean := false;
BEGIN
  actor_id := auth.uid();
  actor_role := current_setting('request.jwt.claim.role', true);

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id is required';
  END IF;

  IF actor_id IS NULL THEN
    IF COALESCE(actor_role, '') <> 'service_role' THEN
      RAISE EXCEPTION 'Authentication required';
    END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = actor_id
        AND role = 'admin'
    )
    INTO actor_is_admin;

    IF actor_id <> target_user_id AND NOT actor_is_admin THEN
      RAISE EXCEPTION 'Not authorized to anonymize this user';
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    full_name = 'Usuario eliminado',
    phone = NULL,
    avatar_url = NULL,
    deleted_at = now(),
    updated_at = now()
  WHERE id = target_user_id;

  UPDATE public.orders
  SET
    customer_name_snapshot = 'Anonimizado',
    customer_email_snapshot = 'anonimizado',
    customer_phone_snapshot = NULL,
    updated_at = now()
  WHERE user_id = target_user_id;

  DELETE FROM public.cart_items WHERE user_id = target_user_id;
  DELETE FROM public.course_progress WHERE user_id = target_user_id;
  DELETE FROM public.lesson_progress WHERE user_id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.anonymize_user_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anonymize_user_data(uuid) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.anonymize_user_data(uuid) TO service_role;
  END IF;
END;
$$;

COMMIT;
