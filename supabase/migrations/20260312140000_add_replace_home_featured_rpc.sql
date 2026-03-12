-- =============================================================================
-- Migration: 20260312140000_add_replace_home_featured_rpc
-- Description: Adds an atomic helper to assign or replace home featured slots.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.replace_course_home_featured_position(
  target_course_id uuid,
  target_position smallint,
  replace_existing boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target_course record;
  current_occupant record;
BEGIN
  SELECT id, title, is_published, home_featured_position
  INTO target_course
  FROM public.courses
  WHERE id = target_course_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Curso no encontrado.';
  END IF;

  IF target_position IS NULL OR target_position < 1 OR target_position > 4 THEN
    RAISE EXCEPTION 'Posicion destacada invalida.';
  END IF;

  IF target_course.is_published IS NOT TRUE THEN
    RAISE EXCEPTION 'Solo los cursos publicados pueden destacarse en home.';
  END IF;

  SELECT id, title, home_featured_position
  INTO current_occupant
  FROM public.courses
  WHERE home_featured_position = target_position
    AND id <> target_course_id
  FOR UPDATE;

  IF current_occupant.id IS NOT NULL AND replace_existing IS NOT TRUE THEN
    RAISE EXCEPTION 'La posicion % ya esta asignada a "%".', target_position, current_occupant.title;
  END IF;

  IF current_occupant.id IS NOT NULL THEN
    UPDATE public.courses
    SET home_featured_position = NULL
    WHERE id = current_occupant.id;
  END IF;

  UPDATE public.courses
  SET home_featured_position = target_position
  WHERE id = target_course_id;

  RETURN jsonb_build_object(
    'target_position', target_position,
    'replaced_course_id', current_occupant.id,
    'replaced_course_title', current_occupant.title
  );
END;
$$;

COMMIT;
