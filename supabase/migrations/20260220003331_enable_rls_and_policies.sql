-- =============================================================================
-- Migration: 20260220003331_enable_rls_and_policies
-- Description: Enables RLS on all 19 tables and creates ~30 access control
--              policies. Roles: anon (public read), user (own data), admin (all).
-- =============================================================================

BEGIN;

-- =============================================================================
-- ENABLE ROW LEVEL SECURITY on all 19 tables
-- =============================================================================
ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_progress       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_rules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs      ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- HELPER: is_admin()
-- Checks if the current authenticated user has admin role.
-- Used in policies to avoid repeating the subquery pattern.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

-- =============================================================================
-- TABLE: profiles
-- - Anyone (anon + user): can SELECT published profile fields
-- - User: can SELECT and UPDATE their own profile (role field excluded from UPDATE)
-- - Admin: full access
-- =============================================================================
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: courses
-- - Anon + authenticated: SELECT published courses
-- - Admin: full CRUD
-- =============================================================================
DROP POLICY IF EXISTS "courses_select_published" ON public.courses;
CREATE POLICY "courses_select_published"
  ON public.courses
  FOR SELECT
  USING (is_published = true);

DROP POLICY IF EXISTS "courses_admin_all" ON public.courses;
CREATE POLICY "courses_admin_all"
  ON public.courses
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: instructors
-- - Anon + authenticated: SELECT active instructors
-- - Admin: full CRUD
-- =============================================================================
DROP POLICY IF EXISTS "instructors_select_active" ON public.instructors;
CREATE POLICY "instructors_select_active"
  ON public.instructors
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "instructors_admin_all" ON public.instructors;
CREATE POLICY "instructors_admin_all"
  ON public.instructors
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: lessons
-- - Anon + authenticated: SELECT free lessons of published courses
-- - Enrolled users: SELECT all lessons of courses they are enrolled in
-- - Admin: full CRUD
-- =============================================================================
DROP POLICY IF EXISTS "lessons_select_free" ON public.lessons;
CREATE POLICY "lessons_select_free"
  ON public.lessons
  FOR SELECT
  USING (
    is_free = true
    AND EXISTS (
      SELECT 1 FROM public.courses
      WHERE courses.id = lessons.course_id
        AND courses.is_published = true
    )
  );

DROP POLICY IF EXISTS "lessons_select_enrolled" ON public.lessons;
CREATE POLICY "lessons_select_enrolled"
  ON public.lessons
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE enrollments.user_id = auth.uid()
        AND enrollments.course_id = lessons.course_id
    )
  );

DROP POLICY IF EXISTS "lessons_admin_all" ON public.lessons;
CREATE POLICY "lessons_admin_all"
  ON public.lessons
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: enrollments
-- - Authenticated user: SELECT their own enrollments
-- - Admin: full access
-- =============================================================================
DROP POLICY IF EXISTS "enrollments_select_own" ON public.enrollments;
CREATE POLICY "enrollments_select_own"
  ON public.enrollments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "enrollments_insert_own" ON public.enrollments;
CREATE POLICY "enrollments_insert_own"
  ON public.enrollments
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "enrollments_admin_all" ON public.enrollments;
CREATE POLICY "enrollments_admin_all"
  ON public.enrollments
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: lesson_progress
-- - Authenticated user: full access to their own progress
-- - Admin: full access
-- =============================================================================
DROP POLICY IF EXISTS "lesson_progress_select_own" ON public.lesson_progress;
CREATE POLICY "lesson_progress_select_own"
  ON public.lesson_progress
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "lesson_progress_insert_own" ON public.lesson_progress;
CREATE POLICY "lesson_progress_insert_own"
  ON public.lesson_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "lesson_progress_update_own" ON public.lesson_progress;
CREATE POLICY "lesson_progress_update_own"
  ON public.lesson_progress
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "lesson_progress_admin_all" ON public.lesson_progress;
CREATE POLICY "lesson_progress_admin_all"
  ON public.lesson_progress
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: course_progress
-- - Authenticated user: full access to their own progress
-- - Admin: full access
-- =============================================================================
DROP POLICY IF EXISTS "course_progress_select_own" ON public.course_progress;
CREATE POLICY "course_progress_select_own"
  ON public.course_progress
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "course_progress_insert_own" ON public.course_progress;
CREATE POLICY "course_progress_insert_own"
  ON public.course_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "course_progress_update_own" ON public.course_progress;
CREATE POLICY "course_progress_update_own"
  ON public.course_progress
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "course_progress_admin_all" ON public.course_progress;
CREATE POLICY "course_progress_admin_all"
  ON public.course_progress
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: orders
-- - Authenticated user: SELECT and INSERT their own orders
-- - Admin: full access
-- Note: UPDATE is intentionally excluded for users (Wompi webhook handles status changes)
-- =============================================================================
DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
CREATE POLICY "orders_select_own"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
CREATE POLICY "orders_insert_own"
  ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "orders_admin_all" ON public.orders;
CREATE POLICY "orders_admin_all"
  ON public.orders
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: order_items
-- - Authenticated user: SELECT their own order items (via order ownership)
-- - Admin: full access
-- =============================================================================
DROP POLICY IF EXISTS "order_items_select_own" ON public.order_items;
CREATE POLICY "order_items_select_own"
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND orders.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "order_items_admin_all" ON public.order_items;
CREATE POLICY "order_items_admin_all"
  ON public.order_items
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: payment_events
-- - Authenticated user: SELECT events for their own orders
-- - Admin: full access
-- Note: INSERT/UPDATE done via service_role in webhook (bypasses RLS)
-- =============================================================================
DROP POLICY IF EXISTS "payment_events_select_own" ON public.payment_events;
CREATE POLICY "payment_events_select_own"
  ON public.payment_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = payment_events.order_id
        AND orders.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "payment_events_admin_all" ON public.payment_events;
CREATE POLICY "payment_events_admin_all"
  ON public.payment_events
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: cart_items
-- - Authenticated user: full CRUD on their own cart
-- - Admin: full access
-- =============================================================================
DROP POLICY IF EXISTS "cart_items_select_own" ON public.cart_items;
CREATE POLICY "cart_items_select_own"
  ON public.cart_items
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "cart_items_insert_own" ON public.cart_items;
CREATE POLICY "cart_items_insert_own"
  ON public.cart_items
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "cart_items_delete_own" ON public.cart_items;
CREATE POLICY "cart_items_delete_own"
  ON public.cart_items
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "cart_items_admin_all" ON public.cart_items;
CREATE POLICY "cart_items_admin_all"
  ON public.cart_items
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: discount_rules
-- - Anon + authenticated: SELECT active rules
-- - Admin: full CRUD
-- =============================================================================
DROP POLICY IF EXISTS "discount_rules_select_active" ON public.discount_rules;
CREATE POLICY "discount_rules_select_active"
  ON public.discount_rules
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "discount_rules_admin_all" ON public.discount_rules;
CREATE POLICY "discount_rules_admin_all"
  ON public.discount_rules
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: reviews
-- - Anon + authenticated: SELECT visible reviews
-- - Authenticated user: INSERT their own review, UPDATE/DELETE their own
-- - Admin: full access
-- =============================================================================
DROP POLICY IF EXISTS "reviews_select_visible" ON public.reviews;
CREATE POLICY "reviews_select_visible"
  ON public.reviews
  FOR SELECT
  USING (is_visible = true);

DROP POLICY IF EXISTS "reviews_insert_own" ON public.reviews;
CREATE POLICY "reviews_insert_own"
  ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "reviews_update_own" ON public.reviews;
CREATE POLICY "reviews_update_own"
  ON public.reviews
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "reviews_delete_own" ON public.reviews;
CREATE POLICY "reviews_delete_own"
  ON public.reviews
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "reviews_admin_all" ON public.reviews;
CREATE POLICY "reviews_admin_all"
  ON public.reviews
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: gallery_items
-- - Anon + authenticated: SELECT all gallery items
-- - Admin: full CRUD
-- =============================================================================
DROP POLICY IF EXISTS "gallery_items_select_all" ON public.gallery_items;
CREATE POLICY "gallery_items_select_all"
  ON public.gallery_items
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "gallery_items_admin_all" ON public.gallery_items;
CREATE POLICY "gallery_items_admin_all"
  ON public.gallery_items
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: posts
-- - Anon + authenticated: SELECT published posts
-- - Admin: full CRUD
-- =============================================================================
DROP POLICY IF EXISTS "posts_select_published" ON public.posts;
CREATE POLICY "posts_select_published"
  ON public.posts
  FOR SELECT
  USING (is_published = true);

DROP POLICY IF EXISTS "posts_admin_all" ON public.posts;
CREATE POLICY "posts_admin_all"
  ON public.posts
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: events
-- - Anon + authenticated: SELECT published events
-- - Admin: full CRUD
-- =============================================================================
DROP POLICY IF EXISTS "events_select_published" ON public.events;
CREATE POLICY "events_select_published"
  ON public.events
  FOR SELECT
  USING (is_published = true);

DROP POLICY IF EXISTS "events_admin_all" ON public.events;
CREATE POLICY "events_admin_all"
  ON public.events
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: contact_messages
-- - Anon + authenticated: INSERT only (anyone can submit a contact form)
-- - Admin: full access (SELECT, UPDATE is_read, DELETE)
-- Note: intentionally no SELECT for non-admins (security advisory warning is expected)
-- =============================================================================
DROP POLICY IF EXISTS "contact_messages_insert_anon" ON public.contact_messages;
CREATE POLICY "contact_messages_insert_anon"
  ON public.contact_messages
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "contact_messages_admin_all" ON public.contact_messages;
CREATE POLICY "contact_messages_admin_all"
  ON public.contact_messages
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: course_notifications
-- - Admin: full access only
-- =============================================================================
DROP POLICY IF EXISTS "course_notifications_admin_all" ON public.course_notifications;
CREATE POLICY "course_notifications_admin_all"
  ON public.course_notifications
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- TABLE: admin_audit_logs
-- - Admin: SELECT only (audit logs are append-only via service_role)
-- Note: INSERT is done via service_role (bypasses RLS) — no INSERT policy needed
-- =============================================================================
DROP POLICY IF EXISTS "admin_audit_logs_admin_select" ON public.admin_audit_logs;
CREATE POLICY "admin_audit_logs_admin_select"
  ON public.admin_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

COMMIT;
