-- =============================================================================
-- Migration: 20260220004828_add_missing_fk_indexes_and_optimize_rls
-- Description: Two-part optimization migration:
--   Part 1 — FK indexes: adds indexes on FK columns that were not covered by
--             the initial migration but are needed for JOIN performance.
--   Part 2 — RLS auth.uid() optimization: replaces bare auth.uid() calls with
--             (SELECT auth.uid()) in policy USING/WITH CHECK expressions.
--             This prevents the "auth_rls_initplan" performance warning in
--             Supabase Advisors. auth.uid() is not a stable function — it is
--             re-evaluated for every row. Wrapping it in a subquery
--             (SELECT auth.uid()) allows the planner to evaluate it once and
--             cache the result as an InitPlan, dramatically improving
--             performance on large tables.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: MISSING FK INDEXES
-- =============================================================================

-- course_progress.last_lesson_id (FK to lessons)
CREATE INDEX IF NOT EXISTS idx_course_progress_last_lesson_id
  ON public.course_progress (last_lesson_id);

-- enrollments.order_id (FK to orders — optional, can be NULL)
CREATE INDEX IF NOT EXISTS idx_enrollments_order_id
  ON public.enrollments (order_id)
  WHERE order_id IS NOT NULL;

-- orders.discount_rule_id (FK to discount_rules — optional)
CREATE INDEX IF NOT EXISTS idx_orders_discount_rule_id
  ON public.orders (discount_rule_id)
  WHERE discount_rule_id IS NOT NULL;

-- order_items.course_id (FK to courses — optional, survives course deletion)
CREATE INDEX IF NOT EXISTS idx_order_items_course_id
  ON public.order_items (course_id)
  WHERE course_id IS NOT NULL;

-- course_notifications.sent_by (FK to profiles)
CREATE INDEX IF NOT EXISTS idx_course_notifications_sent_by
  ON public.course_notifications (sent_by);

-- admin_audit_logs.entity_id (for filtering by specific entity)
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity_id
  ON public.admin_audit_logs (entity_id)
  WHERE entity_id IS NOT NULL;

-- admin_audit_logs.admin_user_id + created_at composite (common query pattern)
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_created
  ON public.admin_audit_logs (admin_user_id, created_at DESC);

-- payment_events.wompi_transaction_id (for lookup by Wompi ID)
CREATE INDEX IF NOT EXISTS idx_payment_events_wompi_transaction_id
  ON public.payment_events (wompi_transaction_id)
  WHERE wompi_transaction_id IS NOT NULL;

-- =============================================================================
-- PART 2: OPTIMIZE RLS POLICIES — REPLACE auth.uid() WITH (SELECT auth.uid())
-- =============================================================================
-- Drop and recreate each policy that uses auth.uid() in USING or WITH CHECK.
-- The (SELECT auth.uid()) form is evaluated once per query (InitPlan) instead
-- of once per row, resolving the auth_rls_initplan Supabase advisor warnings.

-- ---------------------------------------------------------------------------
-- TABLE: profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (
    id = (SELECT auth.uid())
    AND role = (SELECT role FROM public.profiles WHERE id = (SELECT auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- TABLE: enrollments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "enrollments_select_own" ON public.enrollments;
CREATE POLICY "enrollments_select_own"
  ON public.enrollments
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "enrollments_insert_own" ON public.enrollments;
CREATE POLICY "enrollments_insert_own"
  ON public.enrollments
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- TABLE: lesson_progress
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "lesson_progress_select_own" ON public.lesson_progress;
CREATE POLICY "lesson_progress_select_own"
  ON public.lesson_progress
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "lesson_progress_insert_own" ON public.lesson_progress;
CREATE POLICY "lesson_progress_insert_own"
  ON public.lesson_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "lesson_progress_update_own" ON public.lesson_progress;
CREATE POLICY "lesson_progress_update_own"
  ON public.lesson_progress
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- TABLE: course_progress
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "course_progress_select_own" ON public.course_progress;
CREATE POLICY "course_progress_select_own"
  ON public.course_progress
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "course_progress_insert_own" ON public.course_progress;
CREATE POLICY "course_progress_insert_own"
  ON public.course_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "course_progress_update_own" ON public.course_progress;
CREATE POLICY "course_progress_update_own"
  ON public.course_progress
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- TABLE: orders
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
CREATE POLICY "orders_select_own"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
CREATE POLICY "orders_insert_own"
  ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- TABLE: order_items
-- (references orders which references auth.uid())
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "order_items_select_own" ON public.order_items;
CREATE POLICY "order_items_select_own"
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND orders.user_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- TABLE: payment_events
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "payment_events_select_own" ON public.payment_events;
CREATE POLICY "payment_events_select_own"
  ON public.payment_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = payment_events.order_id
        AND orders.user_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- TABLE: cart_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "cart_items_select_own" ON public.cart_items;
CREATE POLICY "cart_items_select_own"
  ON public.cart_items
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "cart_items_insert_own" ON public.cart_items;
CREATE POLICY "cart_items_insert_own"
  ON public.cart_items
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "cart_items_delete_own" ON public.cart_items;
CREATE POLICY "cart_items_delete_own"
  ON public.cart_items
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- TABLE: lessons (enrolled users)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "lessons_select_enrolled" ON public.lessons;
CREATE POLICY "lessons_select_enrolled"
  ON public.lessons
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE enrollments.user_id = (SELECT auth.uid())
        AND enrollments.course_id = lessons.course_id
    )
  );

-- ---------------------------------------------------------------------------
-- TABLE: reviews
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "reviews_insert_own" ON public.reviews;
CREATE POLICY "reviews_insert_own"
  ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "reviews_update_own" ON public.reviews;
CREATE POLICY "reviews_update_own"
  ON public.reviews
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "reviews_delete_own" ON public.reviews;
CREATE POLICY "reviews_delete_own"
  ON public.reviews
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMIT;
