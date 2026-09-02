-- Local candidate only: apply through the approved staging release after SQL/RLS tests.
-- Lesson totals are calculated on read; curriculum edits never fan out learner writes.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_student_courses(
  p_filter text DEFAULT 'all',
  p_sort text DEFAULT 'lastAccessed',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 12
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  WITH summaries AS (
    SELECT e.course_id, e.enrolled_at, e.source, c.title, c.slug, c.thumbnail_url,
      c.category, c.is_free, i.full_name,
      COALESCE(cp.last_accessed_at, e.enrolled_at) AS last_accessed_at,
      last_lesson.id AS last_lesson_id, last_lesson.title AS last_lesson_title,
      counts.total_lessons, counts.completed_lessons, counts.new_lessons,
      counts.has_video_progress,
      counts.total_lessons > 0 AND counts.completed_lessons = counts.total_lessons AS is_completed,
      CASE WHEN counts.total_lessons > 0
        THEN round(counts.completed_lessons * 100.0 / counts.total_lessons)::integer ELSE 0 END AS percentage
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN public.instructors i ON i.id = c.instructor_id
    LEFT JOIN public.course_progress cp ON cp.course_id = e.course_id AND cp.user_id = e.user_id
    LEFT JOIN public.lessons last_lesson ON last_lesson.id = cp.last_lesson_id AND last_lesson.course_id = e.course_id
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS total_lessons,
        count(*) FILTER (WHERE lp.completed IS TRUE)::integer AS completed_lessons,
        count(*) FILTER (WHERE l.created_at > COALESCE(cp.last_accessed_at, e.enrolled_at))::integer AS new_lessons,
        COALESCE(bool_or(lp.video_position > 0), false) AS has_video_progress
      FROM public.lessons l
      LEFT JOIN public.lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = e.user_id
      WHERE l.course_id = e.course_id
    ) counts
    WHERE e.user_id = (SELECT auth.uid())
  ), filtered AS (
    SELECT * FROM summaries WHERE
      CASE p_filter WHEN 'completed' THEN is_completed WHEN 'active' THEN NOT is_completed ELSE true END
  ), paged AS (
    SELECT * FROM filtered
    ORDER BY
      CASE WHEN p_sort = 'progressDesc' THEN percentage END DESC,
      CASE WHEN p_sort = 'progressAsc' THEN percentage END ASC,
      CASE WHEN p_sort = 'enrolledAt' THEN enrolled_at END DESC,
      last_accessed_at DESC, course_id
    LIMIT LEAST(48, GREATEST(1, COALESCE(p_page_size, 12)))
    OFFSET (LEAST(10000, GREATEST(1, COALESCE(p_page, 1))) - 1) *
      LEAST(48, GREATEST(1, COALESCE(p_page_size, 12)))
  )
  SELECT jsonb_build_object(
    'courses', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'course', jsonb_build_object(
        'id', course_id, 'title', title, 'slug', slug, 'thumbnail_url', thumbnail_url,
        'category', category, 'is_free', is_free, 'totalLessons', total_lessons,
        'instructor', CASE WHEN full_name IS NULL THEN NULL ELSE jsonb_build_object('full_name', full_name) END
      ),
      'progress', jsonb_build_object(
        'completedLessons', completed_lessons, 'totalLessons', total_lessons,
        'percentage', percentage, 'isCompleted', is_completed, 'lastLessonId', last_lesson_id,
        'lastLessonTitle', last_lesson_title, 'newLessons', new_lessons,
        'hasVideoProgress', has_video_progress, 'lastAccessedAt', last_accessed_at
      ), 'enrolledAt', enrolled_at, 'source', source
    )) FROM paged), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered),
    'totalCourses', (SELECT count(*) FROM summaries),
    'completedCourses', (SELECT count(*) FROM summaries WHERE is_completed),
    'page', LEAST(10000, GREATEST(1, COALESCE(p_page, 1))),
    'pageSize', LEAST(48, GREATEST(1, COALESCE(p_page_size, 12)))
  );
$$;
REVOKE ALL ON FUNCTION public.get_student_courses(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_courses(text, text, integer, integer) TO authenticated;

-- Privileged internal writer: only server service-role callers can select a user.
-- No caller-controlled user id is exposed to authenticated clients.
CREATE OR REPLACE FUNCTION private.sync_student_course_progress(
  p_user_id uuid, p_course_id uuid, p_last_lesson_id uuid DEFAULT NULL,
  p_set_last_lesson boolean DEFAULT false, p_touch_last_access boolean DEFAULT false,
  p_last_accessed_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_progress public.course_progress;
  v_total integer;
  v_completed integer;
  v_slug text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL AND suspended_at IS NULL) THEN
    RAISE EXCEPTION 'ACCOUNT_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.enrollments WHERE user_id = p_user_id AND course_id = p_course_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENROLLMENT_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_last_lesson_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lessons WHERE id = p_last_lesson_id AND course_id = p_course_id
  ) THEN RAISE EXCEPTION 'LESSON_COURSE_MISMATCH' USING ERRCODE = '22023'; END IF;
  SELECT count(*)::integer, count(*) FILTER (WHERE lp.completed IS TRUE)::integer
    INTO v_total, v_completed
  FROM public.lessons l
  LEFT JOIN public.lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = p_user_id
  WHERE l.course_id = p_course_id;
  SELECT slug INTO v_slug FROM public.courses WHERE id = p_course_id;
  INSERT INTO public.course_progress(user_id, course_id, last_lesson_id, completed_lessons, is_completed, last_accessed_at)
  VALUES (p_user_id, p_course_id, p_last_lesson_id, v_completed, v_total > 0 AND v_total = v_completed,
    COALESCE(p_last_accessed_at, now()))
  ON CONFLICT (user_id, course_id) DO UPDATE SET
    completed_lessons = EXCLUDED.completed_lessons,
    is_completed = EXCLUDED.is_completed,
    last_lesson_id = CASE WHEN p_set_last_lesson THEN p_last_lesson_id ELSE course_progress.last_lesson_id END,
    last_accessed_at = COALESCE(p_last_accessed_at, CASE WHEN p_touch_last_access THEN now() ELSE course_progress.last_accessed_at END)
  RETURNING * INTO v_progress;
  RETURN jsonb_build_object('courseSlug', v_slug, 'lessonIds', '[]'::jsonb, 'progress', to_jsonb(v_progress),
    'aggregate', jsonb_build_object('completedLessons', v_completed, 'totalLessons', v_total, 'isCompleted', v_total > 0 AND v_total = v_completed));
END;
$$;
REVOKE ALL ON FUNCTION private.sync_student_course_progress(uuid, uuid, uuid, boolean, boolean, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sync_student_course_progress(uuid, uuid, uuid, boolean, boolean, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_student_course_progress(
  p_user_id uuid, p_course_id uuid, p_last_lesson_id uuid DEFAULT NULL,
  p_set_last_lesson boolean DEFAULT false, p_touch_last_access boolean DEFAULT false,
  p_last_accessed_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.sync_student_course_progress(p_user_id, p_course_id, p_last_lesson_id, p_set_last_lesson, p_touch_last_access, p_last_accessed_at); $$;
REVOKE ALL ON FUNCTION public.sync_student_course_progress(uuid, uuid, uuid, boolean, boolean, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_student_course_progress(uuid, uuid, uuid, boolean, boolean, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION private.reset_course_progress(p_course_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND deleted_at IS NULL AND suspended_at IS NULL) THEN
    RAISE EXCEPTION 'ACCOUNT_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.enrollments WHERE user_id = v_user_id AND course_id = p_course_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENROLLMENT_REQUIRED' USING ERRCODE = '42501'; END IF;
  UPDATE public.lesson_progress lp SET completed = false, completed_at = NULL, video_position = 0
    WHERE lp.user_id = v_user_id AND EXISTS (
      SELECT 1 FROM public.lessons l WHERE l.id = lp.lesson_id AND l.course_id = p_course_id
    );
  INSERT INTO public.course_progress(user_id, course_id, last_lesson_id, completed_lessons, is_completed, last_accessed_at)
  VALUES (v_user_id, p_course_id, NULL, 0, false, now())
  ON CONFLICT (user_id, course_id) DO UPDATE SET
    last_lesson_id = NULL, completed_lessons = 0, is_completed = false, last_accessed_at = now();
END;
$$;
REVOKE ALL ON FUNCTION private.reset_course_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.reset_course_progress(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.reset_course_progress(p_course_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.reset_course_progress(p_course_id); $$;
REVOKE ALL ON FUNCTION public.reset_course_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_course_progress(uuid) TO authenticated;

-- All lesson mutations take the same enrollment lock as reset, then write the
-- lesson and course aggregate atomically. A failed aggregate rolls back both.
CREATE OR REPLACE FUNCTION private.record_student_lesson_progress(
  p_user_id uuid, p_lesson_id uuid, p_video_position integer DEFAULT NULL,
  p_completed boolean DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_course_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL AND suspended_at IS NULL) THEN
    RAISE EXCEPTION 'ACCOUNT_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  IF p_video_position < 0 OR (p_video_position IS NULL AND p_completed IS NULL) THEN
    RAISE EXCEPTION 'INVALID_PROGRESS' USING ERRCODE = '22023';
  END IF;
  SELECT course_id INTO v_course_id FROM public.lessons WHERE id = p_lesson_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LESSON_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.enrollments WHERE user_id = p_user_id AND course_id = v_course_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENROLLMENT_REQUIRED' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.lesson_progress(user_id, lesson_id, video_position, completed, completed_at)
  VALUES (p_user_id, p_lesson_id, COALESCE(p_video_position, 0), COALESCE(p_completed, false),
    CASE WHEN p_completed THEN now() ELSE NULL END)
  ON CONFLICT (user_id, lesson_id) DO UPDATE SET
    video_position = COALESCE(p_video_position, lesson_progress.video_position),
    completed = COALESCE(p_completed, lesson_progress.completed),
    completed_at = CASE WHEN p_completed IS NULL THEN lesson_progress.completed_at
      WHEN p_completed THEN COALESCE(lesson_progress.completed_at, now()) ELSE NULL END;
  RETURN private.sync_student_course_progress(p_user_id, v_course_id, p_lesson_id, true, true, NULL);
END;
$$;
REVOKE ALL ON FUNCTION private.record_student_lesson_progress(uuid, uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.record_student_lesson_progress(uuid, uuid, integer, boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.record_student_lesson_progress(
  p_user_id uuid, p_lesson_id uuid, p_video_position integer DEFAULT NULL, p_completed boolean DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.record_student_lesson_progress(p_user_id, p_lesson_id, p_video_position, p_completed); $$;
REVOKE ALL ON FUNCTION public.record_student_lesson_progress(uuid, uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_student_lesson_progress(uuid, uuid, integer, boolean) TO service_role;
