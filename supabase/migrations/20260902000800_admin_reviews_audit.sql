-- Local-only artifact. No database execution or production state is asserted.
BEGIN;
CREATE INDEX reviews_moderation_page ON public.reviews (is_visible, created_at DESC, id);
CREATE INDEX audit_result_created_page ON public.admin_audit_logs (result, created_at DESC, id);

-- Keep student self-service, but route moderation of other people's reviews
-- through the audited transaction instead of a direct administrative Data API write.
DROP POLICY IF EXISTS reviews_admin_all ON public.reviews;
CREATE POLICY reviews_admin_select ON public.reviews FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));
REVOKE UPDATE (is_visible) ON public.reviews FROM authenticated;

CREATE FUNCTION public.moderate_review_audited(p_admin_id uuid, p_review_id uuid, p_operation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_before jsonb; v_after jsonb; v_course uuid; v_slug text;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin'
    AND deleted_at IS NULL AND suspended_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_operation NOT IN ('show', 'hide', 'delete') OR p_operation IS NULL THEN
    RAISE EXCEPTION 'invalid_moderation_operation';
  END IF;
  SELECT to_jsonb(r), r.course_id INTO v_before, v_course
    FROM public.reviews r WHERE r.id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review_not_found'; END IF;
  SELECT slug INTO v_slug FROM public.courses WHERE id = v_course;
  IF p_operation = 'delete' THEN
    DELETE FROM public.reviews WHERE id = p_review_id;
    v_after := NULL;
  ELSE
    UPDATE public.reviews SET is_visible = (p_operation = 'show'), updated_at = now()
      WHERE id = p_review_id;
    SELECT to_jsonb(r) INTO v_after FROM public.reviews r WHERE id = p_review_id;
  END IF;
  INSERT INTO public.admin_audit_logs(admin_user_id, action, entity_type, entity_id,
    before_data, after_data, result, metadata)
  VALUES (p_admin_id, 'review.' || p_operation, 'review', p_review_id,
    v_before, v_after, 'success', jsonb_build_object('course_id', v_course));
  RETURN jsonb_build_object('course_id', v_course, 'course_slug', v_slug);
END;
$$;
REVOKE ALL ON FUNCTION public.moderate_review_audited(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_review_audited(uuid, uuid, text) TO service_role;

CREATE FUNCTION public.admin_reviews_page(p_search text DEFAULT '', p_course text DEFAULT '',
  p_visibility text DEFAULT '', p_rating integer DEFAULT NULL, p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH filtered AS NOT MATERIALIZED (
    SELECT r.*, jsonb_build_object('id', u.id, 'full_name', u.full_name) AS "user",
      jsonb_build_object('id', c.id, 'title', c.title, 'slug', c.slug) AS course
    FROM public.reviews r JOIN public.profiles u ON u.id = r.user_id JOIN public.courses c ON c.id = r.course_id
    WHERE (coalesce(p_visibility, '') = '' OR (p_visibility = 'visible' AND r.is_visible)
      OR (p_visibility = 'hidden' AND NOT r.is_visible))
      AND (p_rating IS NULL OR r.rating = p_rating)
      AND (coalesce(p_course, '') = '' OR strpos(lower(c.title), lower(left(p_course, 120))) > 0)
      AND (coalesce(p_search, '') = '' OR strpos(lower(coalesce(r.text, '')), lower(left(p_search, 120))) > 0
        OR strpos(lower(u.full_name), lower(left(p_search, 120))) > 0)
  ), totals AS (SELECT count(*) total FROM filtered), paging AS (
    SELECT total, least(greatest(1, coalesce(p_page, 1)), greatest(1, ceil(total::numeric / 25)))::integer page FROM totals
  ), page_rows AS (
    SELECT * FROM filtered ORDER BY created_at DESC, id
    LIMIT 25 OFFSET (SELECT (page - 1)::bigint * 25 FROM paging)
  ) SELECT jsonb_build_object('total', paging.total, 'page', paging.page,
    'items', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC, r.id) FROM page_rows r), '[]'::jsonb)) FROM paging;
$$;
REVOKE ALL ON FUNCTION public.admin_reviews_page(text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reviews_page(text, text, text, integer, integer) TO service_role;

CREATE FUNCTION public.admin_audit_page(p_action text DEFAULT '', p_admin_search text DEFAULT '',
  p_entity_type text DEFAULT '', p_result text DEFAULT '', p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL, p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH filtered AS NOT MATERIALIZED (
    SELECT a.*, u.full_name AS admin_name FROM public.admin_audit_logs a
    LEFT JOIN public.profiles u ON u.id = a.admin_user_id
    WHERE (coalesce(p_action, '') = '' OR a.action = p_action)
      AND (coalesce(p_admin_search, '') = '' OR strpos(lower(coalesce(u.full_name, '')), lower(left(p_admin_search, 120))) > 0)
      AND (coalesce(p_entity_type, '') = '' OR a.entity_type = p_entity_type)
      AND (coalesce(p_result, '') = '' OR a.result = p_result)
      AND (p_from IS NULL OR a.created_at >= p_from) AND (p_to IS NULL OR a.created_at < p_to)
  ), totals AS (SELECT count(*) total FROM filtered), paging AS (
    SELECT total, least(greatest(1, coalesce(p_page, 1)), greatest(1, ceil(total::numeric / 25)))::integer page FROM totals
  ), page_rows AS (
    SELECT * FROM filtered ORDER BY created_at DESC, id
    LIMIT 25 OFFSET (SELECT (page - 1)::bigint * 25 FROM paging)
  ) SELECT jsonb_build_object('total', paging.total, 'page', paging.page,
    'items', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC, r.id) FROM page_rows r), '[]'::jsonb)) FROM paging;
$$;
REVOKE ALL ON FUNCTION public.admin_audit_page(text, text, text, text, timestamptz, timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_audit_page(text, text, text, text, timestamptz, timestamptz, integer)
  TO service_role;
COMMIT;
