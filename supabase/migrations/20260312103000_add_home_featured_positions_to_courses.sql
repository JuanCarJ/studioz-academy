-- =============================================================================
-- Migration: 20260312103000_add_home_featured_positions_to_courses
-- Description: Adds editorial positions for the home featured courses and
--              keeps the field cleared when a course is unpublished.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'courses'
      AND column_name = 'home_featured_position'
  ) THEN
    ALTER TABLE public.courses
      ADD COLUMN home_featured_position smallint;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'courses_home_featured_position_check'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_home_featured_position_check
      CHECK (
        home_featured_position IS NULL
        OR home_featured_position BETWEEN 1 AND 4
      );
  END IF;
END
$$;

UPDATE public.courses
SET home_featured_position = NULL
WHERE is_published = false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_home_featured_position_unique
  ON public.courses (home_featured_position)
  WHERE home_featured_position IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_course_home_featured_position()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_published IS NOT TRUE THEN
    NEW.home_featured_position := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_course_home_featured_position ON public.courses;

CREATE TRIGGER normalize_course_home_featured_position
BEFORE INSERT OR UPDATE OF is_published, home_featured_position
ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.normalize_course_home_featured_position();

COMMIT;
