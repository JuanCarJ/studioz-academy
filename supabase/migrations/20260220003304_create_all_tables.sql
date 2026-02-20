-- =============================================================================
-- Migration: 20260220003304_create_all_tables
-- Description: Creates 19 tables, trigger functions, and indexes for Studio Z Academy
-- Tables: profiles, courses, instructors, lessons, enrollments, lesson_progress,
--         course_progress, orders, order_items, payment_events, cart_items,
--         discount_rules, reviews, gallery_items, posts, events, contact_messages,
--         course_notifications, admin_audit_logs
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- EXTENSIONS (ensure they are available)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- TABLE: instructors
-- (no FK dependencies — created before courses)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instructors (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  slug           text        NOT NULL,
  full_name      text        NOT NULL,
  bio            text,
  avatar_url     text,
  specialties    text[]      NOT NULL DEFAULT '{}',
  years_experience integer,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT instructors_pkey PRIMARY KEY (id),
  CONSTRAINT instructors_slug_key UNIQUE (slug)
);

COMMENT ON TABLE public.instructors IS 'Instructors who teach courses on the platform';

-- ---------------------------------------------------------------------------
-- TABLE: profiles
-- References auth.users (managed by Supabase Auth trigger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id                   uuid        NOT NULL,
  full_name            text        NOT NULL,
  phone                text,
  avatar_url           text,
  role                 text        NOT NULL DEFAULT 'user',
  email_notifications  boolean     NOT NULL DEFAULT true,
  last_login_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'))
);

COMMENT ON TABLE public.profiles IS 'Extended user profiles linked to auth.users';

-- ---------------------------------------------------------------------------
-- TABLE: courses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  title                 text        NOT NULL,
  slug                  text        NOT NULL,
  description           text,
  short_description     text,
  category              text        NOT NULL,
  price                 integer     NOT NULL DEFAULT 0,
  is_free               boolean     NOT NULL DEFAULT false,
  thumbnail_url         text,
  preview_video_url     text,
  instructor_id         uuid        NOT NULL,
  legacy_instructor_name text,
  rating_avg            numeric,
  reviews_count         integer     NOT NULL DEFAULT 0,
  is_published          boolean     NOT NULL DEFAULT false,
  published_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT courses_pkey PRIMARY KEY (id),
  CONSTRAINT courses_slug_key UNIQUE (slug),
  CONSTRAINT courses_category_check CHECK (category IN ('baile', 'tatuaje')),
  CONSTRAINT courses_price_check CHECK (price >= 0),
  CONSTRAINT courses_rating_avg_check CHECK (rating_avg IS NULL OR (rating_avg >= 1 AND rating_avg <= 5)),
  CONSTRAINT courses_reviews_count_check CHECK (reviews_count >= 0),
  CONSTRAINT courses_instructor_id_fkey FOREIGN KEY (instructor_id)
    REFERENCES public.instructors (id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.courses IS 'Dance and tattoo courses offered by Studio Z';

-- ---------------------------------------------------------------------------
-- TABLE: discount_rules
-- (no FK dependencies — created before orders)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discount_rules (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  name           text        NOT NULL,
  category       text,
  min_courses    integer     NOT NULL,
  discount_type  text        NOT NULL,
  discount_value integer     NOT NULL,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT discount_rules_pkey PRIMARY KEY (id),
  CONSTRAINT discount_rules_min_courses_check CHECK (min_courses > 0),
  CONSTRAINT discount_rules_discount_type_check CHECK (discount_type IN ('percentage', 'fixed')),
  CONSTRAINT discount_rules_discount_value_check CHECK (discount_value > 0),
  CONSTRAINT discount_rules_category_check CHECK (category IS NULL OR category IN ('baile', 'tatuaje'))
);

COMMENT ON TABLE public.discount_rules IS 'Combo discount rules (e.g. buy 2+ courses of same category)';

-- ---------------------------------------------------------------------------
-- TABLE: orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id                       uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id                  uuid,
  customer_name_snapshot   text        NOT NULL,
  customer_email_snapshot  text        NOT NULL,
  customer_phone_snapshot  text,
  reference                text        NOT NULL,
  subtotal                 integer     NOT NULL,
  discount_amount          integer     NOT NULL DEFAULT 0,
  total                    integer     NOT NULL,
  discount_rule_id         uuid,
  status                   text        NOT NULL DEFAULT 'pending',
  wompi_transaction_id     text,
  payment_method           text,
  payment_detail           text,
  currency                 text        NOT NULL DEFAULT 'COP',
  is_user_anonymized       boolean     NOT NULL DEFAULT false,
  anonymized_at            timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  approved_at              timestamptz,
  reverted_at              timestamptz,
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_reference_key UNIQUE (reference),
  CONSTRAINT orders_status_check CHECK (
    status IN ('pending', 'approved', 'declined', 'voided', 'refunded', 'chargeback')
  ),
  CONSTRAINT orders_subtotal_check CHECK (subtotal >= 0),
  CONSTRAINT orders_discount_amount_check CHECK (discount_amount >= 0),
  CONSTRAINT orders_total_check CHECK (total >= 0),
  CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.profiles (id) ON DELETE SET NULL,
  CONSTRAINT orders_discount_rule_id_fkey FOREIGN KEY (discount_rule_id)
    REFERENCES public.discount_rules (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.orders IS 'Payment orders created at checkout';

-- ---------------------------------------------------------------------------
-- TABLE: order_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  order_id              uuid        NOT NULL,
  course_id             uuid,
  course_title_snapshot text        NOT NULL,
  price_at_purchase     integer     NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_price_at_purchase_check CHECK (price_at_purchase >= 0),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES public.orders (id) ON DELETE CASCADE,
  CONSTRAINT order_items_course_id_fkey FOREIGN KEY (course_id)
    REFERENCES public.courses (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.order_items IS 'Line items within an order (one per course)';

-- ---------------------------------------------------------------------------
-- TABLE: payment_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_events (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  order_id             uuid        NOT NULL,
  source               text        NOT NULL,
  wompi_transaction_id text,
  external_status      text        NOT NULL,
  mapped_status        text        NOT NULL,
  is_applied           boolean     NOT NULL DEFAULT false,
  reason               text,
  payload_hash         text        NOT NULL,
  payload_json         jsonb       NOT NULL,
  processed_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payment_events_pkey PRIMARY KEY (id),
  CONSTRAINT payment_events_payload_hash_key UNIQUE (payload_hash),
  CONSTRAINT payment_events_source_check CHECK (source IN ('webhook', 'polling', 'manual')),
  CONSTRAINT payment_events_mapped_status_check CHECK (
    mapped_status IN ('pending', 'approved', 'declined', 'voided', 'refunded', 'chargeback')
  ),
  CONSTRAINT payment_events_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES public.orders (id) ON DELETE CASCADE
);

COMMENT ON TABLE public.payment_events IS 'Idempotent log of all payment status events from Wompi';

-- ---------------------------------------------------------------------------
-- TABLE: enrollments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enrollments (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  course_id   uuid        NOT NULL,
  source      text        NOT NULL,
  order_id    uuid,
  enrolled_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enrollments_pkey PRIMARY KEY (id),
  CONSTRAINT enrollments_user_course_key UNIQUE (user_id, course_id),
  CONSTRAINT enrollments_source_check CHECK (source IN ('purchase', 'free')),
  CONSTRAINT enrollments_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  CONSTRAINT enrollments_course_id_fkey FOREIGN KEY (course_id)
    REFERENCES public.courses (id) ON DELETE CASCADE,
  CONSTRAINT enrollments_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES public.orders (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.enrollments IS 'Records of users enrolled in courses (purchased or free)';

-- ---------------------------------------------------------------------------
-- TABLE: lessons
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lessons (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  course_id        uuid        NOT NULL,
  title            text        NOT NULL,
  description      text,
  bunny_video_id   text        NOT NULL,
  bunny_library_id text        NOT NULL,
  duration_seconds integer     NOT NULL DEFAULT 0,
  sort_order       integer     NOT NULL,
  is_free          boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lessons_pkey PRIMARY KEY (id),
  CONSTRAINT lessons_duration_check CHECK (duration_seconds >= 0),
  CONSTRAINT lessons_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT lessons_course_id_fkey FOREIGN KEY (course_id)
    REFERENCES public.courses (id) ON DELETE CASCADE
);

COMMENT ON TABLE public.lessons IS 'Video lessons belonging to a course';

-- ---------------------------------------------------------------------------
-- TABLE: lesson_progress
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_progress (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL,
  lesson_id    uuid        NOT NULL,
  completed    boolean     NOT NULL DEFAULT false,
  completed_at timestamptz,

  CONSTRAINT lesson_progress_pkey PRIMARY KEY (id),
  CONSTRAINT lesson_progress_user_lesson_key UNIQUE (user_id, lesson_id),
  CONSTRAINT lesson_progress_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  CONSTRAINT lesson_progress_lesson_id_fkey FOREIGN KEY (lesson_id)
    REFERENCES public.lessons (id) ON DELETE CASCADE
);

COMMENT ON TABLE public.lesson_progress IS 'Per-lesson completion status for each student';

-- ---------------------------------------------------------------------------
-- TABLE: course_progress
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_progress (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL,
  course_id         uuid        NOT NULL,
  last_lesson_id    uuid,
  completed_lessons integer     NOT NULL DEFAULT 0,
  is_completed      boolean     NOT NULL DEFAULT false,
  last_accessed_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_progress_pkey PRIMARY KEY (id),
  CONSTRAINT course_progress_user_course_key UNIQUE (user_id, course_id),
  CONSTRAINT course_progress_completed_lessons_check CHECK (completed_lessons >= 0),
  CONSTRAINT course_progress_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  CONSTRAINT course_progress_course_id_fkey FOREIGN KEY (course_id)
    REFERENCES public.courses (id) ON DELETE CASCADE,
  CONSTRAINT course_progress_last_lesson_id_fkey FOREIGN KEY (last_lesson_id)
    REFERENCES public.lessons (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.course_progress IS 'Aggregated progress per student per course';

-- ---------------------------------------------------------------------------
-- TABLE: cart_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cart_items (
  id        uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id   uuid        NOT NULL,
  course_id uuid        NOT NULL,
  added_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cart_items_pkey PRIMARY KEY (id),
  CONSTRAINT cart_items_user_course_key UNIQUE (user_id, course_id),
  CONSTRAINT cart_items_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  CONSTRAINT cart_items_course_id_fkey FOREIGN KEY (course_id)
    REFERENCES public.courses (id) ON DELETE CASCADE
);

COMMENT ON TABLE public.cart_items IS 'Shopping cart items per user';

-- ---------------------------------------------------------------------------
-- TABLE: reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviews (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL,
  course_id  uuid        NOT NULL,
  rating     integer     NOT NULL,
  text       text,
  is_visible boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reviews_pkey PRIMARY KEY (id),
  CONSTRAINT reviews_user_course_key UNIQUE (user_id, course_id),
  CONSTRAINT reviews_rating_check CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  CONSTRAINT reviews_course_id_fkey FOREIGN KEY (course_id)
    REFERENCES public.courses (id) ON DELETE CASCADE
);

COMMENT ON TABLE public.reviews IS 'Student reviews and ratings for courses';

-- ---------------------------------------------------------------------------
-- TABLE: gallery_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gallery_items (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  image_url  text        NOT NULL,
  caption    text,
  category   text        NOT NULL,
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gallery_items_pkey PRIMARY KEY (id),
  CONSTRAINT gallery_items_category_check CHECK (category IN ('baile', 'tatuaje')),
  CONSTRAINT gallery_items_sort_order_check CHECK (sort_order >= 0)
);

COMMENT ON TABLE public.gallery_items IS 'Photo gallery items for the public gallery page';

-- ---------------------------------------------------------------------------
-- TABLE: posts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.posts (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  title           text        NOT NULL,
  slug            text        NOT NULL,
  content         text,
  excerpt         text,
  cover_image_url text,
  is_published    boolean     NOT NULL DEFAULT false,
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT posts_pkey PRIMARY KEY (id),
  CONSTRAINT posts_slug_key UNIQUE (slug)
);

COMMENT ON TABLE public.posts IS 'Blog/news posts for the noticias section';

-- ---------------------------------------------------------------------------
-- TABLE: events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  title        text        NOT NULL,
  description  text,
  image_url    text,
  event_date   timestamptz NOT NULL,
  location     text,
  is_published boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT events_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.events IS 'Events for the public eventos page';

-- ---------------------------------------------------------------------------
-- TABLE: contact_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  email      text        NOT NULL,
  subject    text,
  message    text        NOT NULL,
  is_read    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contact_messages_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.contact_messages IS 'Messages submitted via the contact form';

-- ---------------------------------------------------------------------------
-- TABLE: course_notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_notifications (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  course_id        uuid        NOT NULL,
  sent_by          uuid        NOT NULL,
  recipients_count integer     NOT NULL,
  sent_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT course_notifications_course_id_key UNIQUE (course_id),
  CONSTRAINT course_notifications_recipients_count_check CHECK (recipients_count >= 0),
  CONSTRAINT course_notifications_course_id_fkey FOREIGN KEY (course_id)
    REFERENCES public.courses (id) ON DELETE CASCADE,
  CONSTRAINT course_notifications_sent_by_fkey FOREIGN KEY (sent_by)
    REFERENCES public.profiles (id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.course_notifications IS 'Log of new-course email notifications sent to students';

-- ---------------------------------------------------------------------------
-- TABLE: admin_audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  admin_user_id  uuid        NOT NULL,
  action         text        NOT NULL,
  entity_type    text        NOT NULL,
  entity_id      uuid,
  before_data    jsonb,
  after_data     jsonb,
  result         text        NOT NULL,
  metadata       jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT admin_audit_logs_result_check CHECK (result IN ('success', 'error')),
  CONSTRAINT admin_audit_logs_admin_user_id_fkey FOREIGN KEY (admin_user_id)
    REFERENCES public.profiles (id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.admin_audit_logs IS 'Immutable audit trail of all admin actions';

-- =============================================================================
-- TRIGGER FUNCTIONS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- FUNCTION: handle_new_user
-- Creates a profile row when a new auth.users record is inserted
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'avatar_url',
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- TRIGGER: on_auth_user_created
-- Fires after INSERT on auth.users — creates corresponding profile
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- FUNCTION: set_updated_at
-- Generic trigger function to keep updated_at current
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply set_updated_at trigger to tables that have updated_at
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'courses', 'instructors', 'discount_rules',
    'lessons', 'reviews', 'gallery_items', 'posts', 'events'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON public.%I;
       CREATE TRIGGER set_updated_at
         BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t, t
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- FUNCTION: refresh_course_rating_stats
-- Recalculates rating_avg and reviews_count on courses when reviews change
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_course_rating_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_course_id uuid;
BEGIN
  -- Determine which course_id to refresh
  IF TG_OP = 'DELETE' THEN
    target_course_id := OLD.course_id;
  ELSE
    target_course_id := NEW.course_id;
  END IF;

  UPDATE public.courses
  SET
    rating_avg    = (
      SELECT ROUND(AVG(rating)::numeric, 2)
      FROM public.reviews
      WHERE course_id = target_course_id
        AND is_visible = true
    ),
    reviews_count = (
      SELECT COUNT(*)
      FROM public.reviews
      WHERE course_id = target_course_id
        AND is_visible = true
    )
  WHERE id = target_course_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------------------------
-- TRIGGER: refresh_course_rating_stats
-- Fires after INSERT, UPDATE, or DELETE on reviews
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS refresh_course_rating_stats ON public.reviews;
CREATE TRIGGER refresh_course_rating_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_course_rating_stats();

-- =============================================================================
-- INDEXES
-- Performance indexes on frequently queried columns
-- =============================================================================

-- instructors
CREATE INDEX IF NOT EXISTS idx_instructors_slug ON public.instructors (slug);
CREATE INDEX IF NOT EXISTS idx_instructors_is_active ON public.instructors (is_active);

-- courses
CREATE INDEX IF NOT EXISTS idx_courses_slug ON public.courses (slug);
CREATE INDEX IF NOT EXISTS idx_courses_instructor_id ON public.courses (instructor_id);
CREATE INDEX IF NOT EXISTS idx_courses_is_published ON public.courses (is_published);
CREATE INDEX IF NOT EXISTS idx_courses_category ON public.courses (category);
CREATE INDEX IF NOT EXISTS idx_courses_is_free ON public.courses (is_free);
CREATE INDEX IF NOT EXISTS idx_courses_published_at ON public.courses (published_at DESC);

-- lessons
CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON public.lessons (course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_sort_order ON public.lessons (course_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_lessons_is_free ON public.lessons (is_free);

-- enrollments
CREATE INDEX IF NOT EXISTS idx_enrollments_user_id ON public.enrollments (user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON public.enrollments (course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_order_id ON public.enrollments (order_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_enrolled_at ON public.enrollments (enrolled_at DESC);

-- lesson_progress
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_id ON public.lesson_progress (user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson_id ON public.lesson_progress (lesson_id);

-- course_progress
CREATE INDEX IF NOT EXISTS idx_course_progress_user_id ON public.course_progress (user_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_course_id ON public.course_progress (course_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_last_lesson_id ON public.course_progress (last_lesson_id);

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_reference ON public.orders (reference);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_discount_rule_id ON public.orders (discount_rule_id);

-- order_items
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_course_id ON public.order_items (course_id);

-- payment_events
CREATE INDEX IF NOT EXISTS idx_payment_events_order_id ON public.payment_events (order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_payload_hash ON public.payment_events (payload_hash);
CREATE INDEX IF NOT EXISTS idx_payment_events_is_applied ON public.payment_events (is_applied);

-- cart_items
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON public.cart_items (user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_course_id ON public.cart_items (course_id);

-- reviews
CREATE INDEX IF NOT EXISTS idx_reviews_course_id ON public.reviews (course_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON public.reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_is_visible ON public.reviews (is_visible);

-- gallery_items
CREATE INDEX IF NOT EXISTS idx_gallery_items_category ON public.gallery_items (category);
CREATE INDEX IF NOT EXISTS idx_gallery_items_sort_order ON public.gallery_items (sort_order);

-- posts
CREATE INDEX IF NOT EXISTS idx_posts_slug ON public.posts (slug);
CREATE INDEX IF NOT EXISTS idx_posts_is_published ON public.posts (is_published);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON public.posts (published_at DESC);

-- events
CREATE INDEX IF NOT EXISTS idx_events_is_published ON public.events (is_published);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON public.events (event_date DESC);

-- contact_messages
CREATE INDEX IF NOT EXISTS idx_contact_messages_is_read ON public.contact_messages (is_read);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON public.contact_messages (created_at DESC);

-- course_notifications
CREATE INDEX IF NOT EXISTS idx_course_notifications_course_id ON public.course_notifications (course_id);
CREATE INDEX IF NOT EXISTS idx_course_notifications_sent_by ON public.course_notifications (sent_by);

-- admin_audit_logs
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_user_id ON public.admin_audit_logs (admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity_type ON public.admin_audit_logs (entity_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs (created_at DESC);

COMMIT;
