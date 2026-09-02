-- Local-only audit remediation. Wrapper migration-new was blocked by missing
-- staging identity; this file has NOT been executed against any database.
BEGIN;

-- RLS policies are permissive (OR), so remove both legacy naming families.
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin reads all profiles" ON public.profiles;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin' AND deleted_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));
CREATE POLICY profiles_select_admin ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) AND deleted_at IS NULL)
  WITH CHECK (id = (SELECT auth.uid()) AND deleted_at IS NULL);

-- RLS cannot protect columns. Roles and lifecycle fields are server-owned.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, phone, avatar_url, email_notifications)
  ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Purchases and entitlements are created only by validated server transactions.
DROP POLICY IF EXISTS enrollments_insert_own ON public.enrollments;
DROP POLICY IF EXISTS orders_insert_own ON public.orders;
REVOKE INSERT, UPDATE, DELETE ON public.enrollments, public.orders, public.order_items
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.enrollments, public.orders, public.order_items TO authenticated;
GRANT ALL ON public.enrollments, public.orders, public.order_items TO service_role;

ALTER TABLE public.order_discount_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_discount_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_discount_lines TO authenticated;
GRANT ALL ON public.order_discount_lines TO service_role;
CREATE POLICY order_discount_lines_select_own ON public.order_discount_lines
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders o
      WHERE o.id = order_discount_lines.order_id AND o.user_id = (SELECT auth.uid()))
    OR (SELECT public.is_admin())
  );

-- Publication controls the catalog, not an already granted entitlement.
CREATE POLICY courses_select_enrolled ON public.courses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enrollments e
    WHERE e.course_id = courses.id AND e.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS lesson_progress_select_own ON public.lesson_progress;
DROP POLICY IF EXISTS lesson_progress_insert_own ON public.lesson_progress;
DROP POLICY IF EXISTS lesson_progress_update_own ON public.lesson_progress;
CREATE POLICY lesson_progress_select_own ON public.lesson_progress FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.lessons l JOIN public.enrollments e ON e.course_id = l.course_id
    WHERE l.id = lesson_progress.lesson_id AND e.user_id = (SELECT auth.uid())
  ));
CREATE POLICY lesson_progress_insert_own ON public.lesson_progress FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.lessons l JOIN public.enrollments e ON e.course_id = l.course_id
    WHERE l.id = lesson_progress.lesson_id AND e.user_id = (SELECT auth.uid())
  ));
CREATE POLICY lesson_progress_update_own ON public.lesson_progress FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.lessons l JOIN public.enrollments e ON e.course_id = l.course_id
    WHERE l.id = lesson_progress.lesson_id AND e.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS course_progress_select_own ON public.course_progress;
DROP POLICY IF EXISTS course_progress_insert_own ON public.course_progress;
DROP POLICY IF EXISTS course_progress_update_own ON public.course_progress;
CREATE POLICY course_progress_select_own ON public.course_progress FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.course_id = course_progress.course_id AND e.user_id = (SELECT auth.uid())
  ));
CREATE POLICY course_progress_insert_own ON public.course_progress FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.course_id = course_progress.course_id AND e.user_id = (SELECT auth.uid())
  ) AND (last_lesson_id IS NULL OR EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.id = course_progress.last_lesson_id AND l.course_id = course_progress.course_id
  )));
CREATE POLICY course_progress_update_own ON public.course_progress FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.course_id = course_progress.course_id AND e.user_id = (SELECT auth.uid())
  ) AND (last_lesson_id IS NULL OR EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.id = course_progress.last_lesson_id AND l.course_id = course_progress.course_id
  )));

-- Reviews require the exact approved order and course line. Approved zero-total
-- promotions qualify without invoking a gateway; legacy enrollments without an
-- order intentionally require an explicit support repair before reviewing.
CREATE FUNCTION public.can_review_course(p_course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.user_id = (SELECT auth.uid()) AND e.course_id = p_course_id
      AND EXISTS (
        SELECT 1 FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.id = e.order_id AND o.user_id = (SELECT auth.uid())
          AND o.status = 'approved' AND oi.course_id = e.course_id
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_review_course(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_review_course(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS reviews_insert_own ON public.reviews;
DROP POLICY IF EXISTS reviews_update_own ON public.reviews;
CREATE POLICY reviews_select_own ON public.reviews FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY reviews_insert_own ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.can_review_course(course_id));
CREATE POLICY reviews_update_own ON public.reviews FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.can_review_course(course_id));
REVOKE INSERT, UPDATE ON public.reviews FROM PUBLIC, anon, authenticated;
GRANT INSERT (user_id, course_id, rating, text) ON public.reviews TO authenticated;
GRANT UPDATE (rating, text, is_visible) ON public.reviews TO authenticated;

-- Keep admin moderation while preventing students from undoing it directly.
CREATE FUNCTION public.guard_review_moderation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT public.is_admin()
     AND NEW.is_visible IS DISTINCT FROM OLD.is_visible THEN
    RAISE EXCEPTION 'Review moderation requires an administrator' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_review_moderation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_review_moderation BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_review_moderation();

-- Prevent direct Data API submissions from bypassing the contact action limit.
DROP POLICY IF EXISTS contact_messages_insert_anon ON public.contact_messages;
REVOKE INSERT ON public.contact_messages FROM PUBLIC, anon, authenticated;
GRANT INSERT ON public.contact_messages TO service_role;

-- Avatar uploads must pass the authenticated server decoder. Storage MIME
-- metadata alone does not validate file contents and must not be a bypass.
DROP POLICY IF EXISTS avatars_user_insert ON storage.objects;
DROP POLICY IF EXISTS avatars_user_update ON storage.objects;

-- Existing trigger functions are internal, not general-purpose API RPCs.
REVOKE ALL ON FUNCTION public.handle_new_user(), public.set_updated_at(),
  public.refresh_course_rating_stats(), public.normalize_course_home_featured_position()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_course_home_featured_position(uuid, smallint, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_course_home_featured_position(uuid, smallint, boolean)
  TO authenticated, service_role;

-- Indexes follow existing history/review queries; no speculative index drops.
CREATE INDEX idx_orders_user_created ON public.orders (user_id, created_at DESC);
CREATE INDEX idx_reviews_course_visible_created ON public.reviews (course_id, created_at DESC)
  WHERE is_visible = true;
CREATE INDEX idx_order_items_order_course ON public.order_items (order_id, course_id);

-- Shared fixed-window abuse limits: service-role-only API, atomic row locking
-- via UPSERT. Only opaque HMAC keys are stored; no email or IP payloads.
CREATE TABLE public.security_rate_limits (
  key text PRIMARY KEY CHECK (key ~ '^[a-f0-9]{64}$'),
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_rate_limits TO service_role;
CREATE INDEX security_rate_limits_expiry ON public.security_rate_limits (expires_at);

CREATE FUNCTION public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_expiry timestamptz;
BEGIN
  IF p_key IS NULL OR p_key !~ '^[a-f0-9]{64}$' OR p_limit IS NULL
     OR p_limit < 1 OR p_limit > 10000 OR p_window_seconds IS NULL
     OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit configuration';
  END IF;

  -- Bounded, contention-safe expiration; never deletes an active window.
  WITH expired AS (
    SELECT key FROM public.security_rate_limits
    WHERE expires_at < v_now - interval '1 day'
    ORDER BY expires_at LIMIT 20 FOR UPDATE SKIP LOCKED
  ) DELETE FROM public.security_rate_limits r USING expired e WHERE r.key = e.key;

  INSERT INTO public.security_rate_limits AS r (key, attempts, expires_at)
  VALUES (p_key, 1, v_now + make_interval(secs => p_window_seconds))
  ON CONFLICT (key) DO UPDATE SET
    attempts = CASE WHEN r.expires_at <= v_now THEN 1 ELSE r.attempts + 1 END,
    expires_at = CASE WHEN r.expires_at <= v_now
      THEN v_now + make_interval(secs => p_window_seconds) ELSE r.expires_at END
  WHERE r.expires_at <= v_now OR r.attempts < p_limit
  RETURNING expires_at INTO v_expiry;

  IF FOUND THEN
    RETURN QUERY SELECT true, 0;
  ELSE
    SELECT expires_at INTO v_expiry FROM public.security_rate_limits WHERE key = p_key;
    RETURN QUERY SELECT false, greatest(1, ceil(extract(epoch FROM (v_expiry - v_now)))::integer);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

COMMIT;
