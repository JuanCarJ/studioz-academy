-- Prepared locally only; staging identity and SQL execution remain unverified.
BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
-- Respect an existing extension installation in a different schema.
DO $$
DECLARE v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm';
  EXECUTE format('CREATE INDEX catalog_title_search ON public.courses USING gin (title %I.gin_trgm_ops) WHERE is_published AND archived_at IS NULL', v_schema);
  EXECUTE format('CREATE INDEX catalog_description_search ON public.courses USING gin (short_description %I.gin_trgm_ops) WHERE is_published AND archived_at IS NULL', v_schema);
  EXECUTE format('CREATE INDEX catalog_instructor_search ON public.instructors USING gin (full_name %I.gin_trgm_ops)', v_schema);
END;
$$;
CREATE INDEX catalog_published_newest ON public.courses (published_at DESC NULLS LAST, id)
  WHERE is_published AND archived_at IS NULL;
CREATE INDEX catalog_published_price ON public.courses (price, id)
  WHERE is_published AND archived_at IS NULL;

CREATE FUNCTION public.search_public_courses(
  p_category text DEFAULT '', p_search text DEFAULT '', p_instructor uuid DEFAULT NULL,
  p_sort text DEFAULT 'newest', p_page integer DEFAULT 1, p_page_size integer DEFAULT 12
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_size integer := least(24, greatest(1, coalesce(p_page_size, 12)));
  v_search text := left(trim(coalesce(p_search, '')), 120);
  v_sort text := CASE WHEN p_sort IN ('price_asc', 'price_desc') THEN p_sort ELSE 'newest' END;
  v_pattern text;
  v_result jsonb;
BEGIN
  -- Bound parameters, not interpolated PostgREST syntax. %, _ and backslash
  -- remain literal user text, including names containing commas/parentheses.
  v_pattern := '%' || replace(replace(replace(v_search, chr(92), chr(92) || chr(92)),
    '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
  WITH matching AS NOT MATERIALIZED (
    SELECT c.id, c.title, c.slug, c.short_description, c.category, c.price, c.is_free,
      c.thumbnail_url, c.rating_avg, c.reviews_count, c.course_discount_enabled,
      c.course_discount_type, c.course_discount_value, c.published_at, c.instructor_id,
      jsonb_build_object('id', i.id, 'full_name', i.full_name) AS instructor
    FROM public.courses c JOIN public.instructors i ON i.id = c.instructor_id
    WHERE c.is_published AND c.archived_at IS NULL
      AND (coalesce(p_category, '') = '' OR c.category = p_category)
      AND (p_instructor IS NULL OR c.instructor_id = p_instructor)
      AND (v_search = '' OR c.title ILIKE v_pattern OR c.short_description ILIKE v_pattern
        OR c.instructor_id IN (SELECT si.id FROM public.instructors si WHERE si.full_name ILIKE v_pattern))
  ), totals AS (
    SELECT count(*) AS total FROM matching
  ), paging AS (
    SELECT total, least(greatest(1, coalesce(p_page, 1)),
      greatest(1, ceil(total::numeric / v_size)))::integer AS page FROM totals
  ), page_rows AS (
    SELECT m.*, row_number() OVER (ORDER BY
      CASE WHEN v_sort = 'price_asc' THEN m.price END ASC,
      CASE WHEN v_sort = 'price_desc' THEN m.price END DESC,
      CASE WHEN v_sort = 'newest' THEN m.published_at END DESC NULLS LAST, m.id ASC) AS ordinal
    FROM matching m
    ORDER BY
      CASE WHEN v_sort = 'price_asc' THEN m.price END ASC,
      CASE WHEN v_sort = 'price_desc' THEN m.price END DESC,
      CASE WHEN v_sort = 'newest' THEN m.published_at END DESC NULLS LAST, m.id ASC
    LIMIT v_size OFFSET (SELECT (page - 1)::bigint * v_size FROM paging)
  )
  SELECT jsonb_build_object('total', paging.total, 'page', paging.page, 'page_size', v_size,
    'items', coalesce((SELECT jsonb_agg(to_jsonb(p) - 'ordinal' ORDER BY p.ordinal) FROM page_rows p), '[]'::jsonb))
  INTO v_result FROM paging;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.search_public_courses(text, text, uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_courses(text, text, uuid, text, integer, integer)
  TO service_role;

-- One small option per instructor, without first transferring all course IDs.
CREATE FUNCTION public.public_catalog_instructors()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'full_name', i.full_name)
    ORDER BY i.full_name, i.id), '[]'::jsonb)
  FROM public.instructors i
  WHERE EXISTS (SELECT 1 FROM public.courses c
    WHERE c.instructor_id = i.id AND c.is_published AND c.archived_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.public_catalog_instructors() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_catalog_instructors() TO service_role;
COMMIT;
