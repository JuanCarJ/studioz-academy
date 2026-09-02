-- Local migration artifact; not applied. Requires the preceding audit migrations.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND role='admin' AND deleted_at IS NULL AND suspended_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.is_active_account() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND deleted_at IS NULL AND suspended_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.is_active_account() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_active_account() TO authenticated,service_role;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['enrollments','orders','order_items','order_discount_lines','lesson_progress','course_progress','reviews','cart_items','lessons','payment_events'] LOOP
  EXECUTE format('CREATE POLICY active_account_gate ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.is_active_account())) WITH CHECK ((SELECT public.is_active_account()))',t);
 END LOOP;
END $$;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.contact_messages ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','resolved'));
ALTER TABLE public.contact_messages ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.contact_messages ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE public.contact_messages ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS contacts_work_queue_idx ON public.contact_messages(status, created_at DESC, id);
CREATE TABLE public.user_support_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES public.profiles(id),
  note text NOT NULL CHECK (length(note) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_support_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_support_notes FROM anon, authenticated;
GRANT ALL ON public.user_support_notes TO service_role;
CREATE INDEX support_notes_user_idx ON public.user_support_notes(user_id,created_at DESC,id);

-- Internal operations use an actor checked by the server AND rechecked under lock.
CREATE OR REPLACE FUNCTION public.admin_operate(p_admin_id uuid,p_action text,p_target_id uuid,p_input jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_before jsonb; v_after jsonb; v_course uuid; v_order uuid; v_reason text;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id=p_admin_id AND role='admin' AND deleted_at IS NULL AND suspended_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin_required'; END IF;
  v_reason := trim(coalesce(p_input->>'reason',''));
  IF length(v_reason)<5 OR length(v_reason)>2000 THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF p_action IN ('course.archive','course.restore') THEN
    SELECT to_jsonb(c) INTO v_before FROM public.courses c WHERE id=p_target_id FOR UPDATE;
    IF v_before IS NULL THEN RAISE EXCEPTION 'course_not_found'; END IF;
    UPDATE public.courses SET is_published=false, archived_at=CASE WHEN p_action='course.archive' THEN now() ELSE NULL END,
      home_featured_position=NULL, updated_at=now() WHERE id=p_target_id;
    SELECT jsonb_build_object('is_published',is_published,'archived_at',archived_at) INTO v_after FROM public.courses WHERE id=p_target_id;
    v_before := jsonb_build_object('is_published',v_before->'is_published','archived_at',v_before->'archived_at');
  ELSIF p_action='contact.update' THEN
    SELECT jsonb_build_object('status',status,'assigned_to',assigned_to) INTO v_before FROM public.contact_messages WHERE id=p_target_id FOR UPDATE;
    IF v_before IS NULL THEN RAISE EXCEPTION 'contact_not_found'; END IF;
    IF coalesce(p_input->>'status','') NOT IN ('new','in_progress','resolved') THEN RAISE EXCEPTION 'invalid_status'; END IF;
    UPDATE public.contact_messages SET status=p_input->>'status',is_read=true,
      assigned_to=CASE WHEN p_input->>'assign'='me' THEN p_admin_id ELSE assigned_to END,
      notes=left(coalesce(p_input->>'notes',notes),4000),updated_at=now() WHERE id=p_target_id;
    SELECT jsonb_build_object('status',status,'assigned_to',assigned_to) INTO v_after FROM public.contact_messages WHERE id=p_target_id;
  ELSIF p_action='user.note' THEN
    PERFORM 1 FROM public.profiles WHERE id=p_target_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
    INSERT INTO public.user_support_notes(user_id,admin_user_id,note) VALUES(p_target_id,p_admin_id,v_reason);
    v_after := jsonb_build_object('note_added',true);
  ELSIF p_action IN ('user.suspend','user.resume') THEN
    SELECT jsonb_build_object('role',role,'suspended_at',suspended_at) INTO v_before FROM public.profiles WHERE id=p_target_id FOR UPDATE;
    IF v_before IS NULL OR v_before->>'role'='admin' OR p_admin_id=p_target_id THEN RAISE EXCEPTION 'protected_account'; END IF;
    UPDATE public.profiles SET suspended_at=CASE WHEN p_action='user.suspend' THEN now() ELSE NULL END WHERE id=p_target_id;
    SELECT jsonb_build_object('suspended_at',suspended_at) INTO v_after FROM public.profiles WHERE id=p_target_id;
  ELSIF p_action IN ('access.restore','access.revoke','progress.reset') THEN
    v_course := (p_input->>'courseId')::uuid;
    -- Same per-student/course lock used for support operations.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('entitlement:'||p_target_id::text,0));
    SELECT to_jsonb(e) INTO v_before FROM public.enrollments e WHERE user_id=p_target_id AND course_id=v_course FOR UPDATE;
    IF p_action='access.restore' THEN
      SELECT o.id INTO v_order FROM public.orders o JOIN public.order_items i ON i.order_id=o.id
       WHERE o.user_id=p_target_id AND o.status='approved' AND i.course_id=v_course ORDER BY o.created_at DESC LIMIT 1;
      IF v_order IS NULL THEN RAISE EXCEPTION 'approved_purchase_required'; END IF;
      DELETE FROM public.enrollment_blocks WHERE user_id=p_target_id AND course_id=v_course;
      INSERT INTO public.enrollments(user_id,course_id,source,order_id) VALUES(p_target_id,v_course,'purchase',v_order)
       ON CONFLICT(user_id,course_id) DO UPDATE SET order_id=excluded.order_id,source='purchase';
    ELSIF p_action='access.revoke' THEN
      IF v_before IS NULL THEN RAISE EXCEPTION 'enrollment_required'; END IF;
      INSERT INTO public.enrollment_blocks(user_id,course_id,blocked_by,reason) VALUES(p_target_id,v_course,p_admin_id,v_reason)
       ON CONFLICT(user_id,course_id) DO UPDATE SET reason=excluded.reason,blocked_by=excluded.blocked_by,created_at=now();
      DELETE FROM public.enrollments WHERE user_id=p_target_id AND course_id=v_course;
    ELSE
      IF v_before IS NULL THEN RAISE EXCEPTION 'enrollment_required'; END IF;
      DELETE FROM public.lesson_progress WHERE user_id=p_target_id AND lesson_id IN (SELECT id FROM public.lessons WHERE course_id=v_course);
      DELETE FROM public.course_progress WHERE user_id=p_target_id AND course_id=v_course;
    END IF;
    v_after := jsonb_build_object('course_id',v_course,'operation',p_action);
  ELSE RAISE EXCEPTION 'unknown_operation'; END IF;
  INSERT INTO public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,before_data,after_data,result,metadata)
    VALUES(p_admin_id,p_action,split_part(p_action,'.',1),p_target_id,v_before,v_after,'success',jsonb_build_object('reason',v_reason));
  RETURN coalesce(v_after,'{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_operate(uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_operate(uuid,text,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_sales_summary(p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH filtered AS (SELECT * FROM public.orders WHERE (p_from IS NULL OR created_at>=p_from) AND (p_to IS NULL OR created_at<p_to)),
 stats AS (SELECT count(*) FILTER(WHERE status='approved') n,coalesce(sum(total) FILTER(WHERE status='approved'),0) revenue,
 coalesce(sum(discount_amount) FILTER(WHERE status='approved'),0) discount FROM filtered),
 statuses AS (SELECT status,count(*) n FROM filtered GROUP BY status)
 SELECT jsonb_build_object('totalOrders',n,'totalRevenue',revenue,'averageOrderValue',CASE WHEN n=0 THEN 0 ELSE round(revenue/n) END,
 'totalDiscountGiven',discount,'topPaymentMethod',(SELECT payment_method FROM filtered WHERE status='approved' AND payment_method IS NOT NULL GROUP BY payment_method ORDER BY count(*) DESC,payment_method LIMIT 1),
 'statusDistribution',coalesce((SELECT jsonb_object_agg(status,n) FROM statuses),'{}'::jsonb)) FROM stats;
$$;
REVOKE ALL ON FUNCTION public.admin_sales_summary(timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sales_summary(timestamptz,timestamptz) TO service_role;

CREATE FUNCTION public.admin_queue_health() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object(
 'stalePayments',(SELECT count(*) FROM public.orders WHERE status='pending' AND created_at<now()-interval '30 minutes'),
 'failedEmails',(SELECT count(*) FROM public.order_email_outbox WHERE status='failed'),
 'unprocessedNotifications',(SELECT count(*) FROM public.payment_notification_inbox WHERE processed_at IS NULL AND (attempts>=5 OR received_at<now()-interval '15 minutes')),
 'videoIssues',(SELECT count(*) FROM public.lessons WHERE video_upload_error IS NOT NULL OR bunny_status='error')+
               (SELECT count(*) FROM public.courses WHERE preview_upload_error IS NOT NULL OR preview_status='error'));
$$;
REVOKE ALL ON FUNCTION public.admin_queue_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_queue_health() TO service_role;
CREATE INDEX orders_pending_age_idx ON public.orders(created_at,id) WHERE status='pending';
CREATE INDEX order_discount_lines_course_idx ON public.order_discount_lines(course_id) WHERE course_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_courses_page(p_search text DEFAULT '',p_state text DEFAULT '',p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH filtered AS (SELECT c.* FROM public.courses c WHERE (p_search='' OR c.title ILIKE '%'||left(p_search,100)||'%')
 AND (p_state='' OR (p_state='published' AND c.is_published) OR (p_state='draft' AND NOT c.is_published AND c.archived_at IS NULL) OR (p_state='archived' AND c.archived_at IS NOT NULL))),
 page AS (SELECT * FROM filtered ORDER BY created_at DESC,id LIMIT 25 OFFSET ((greatest(1,least(p_page,10000))-1)*25))
 SELECT jsonb_build_object('totalCount',(SELECT count(*) FROM filtered),'courses',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('instructor',(SELECT jsonb_build_object('id',id,'full_name',full_name) FROM public.instructors WHERE id=p.instructor_id),'enrollment_count',(SELECT count(*) FROM public.enrollments WHERE course_id=p.id))) FROM page p),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.admin_courses_page(text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_courses_page(text,text,integer) TO service_role;

-- Guard archived content even when another administrative surface publishes it.
CREATE OR REPLACE FUNCTION public.prevent_archived_course_publication() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN IF NEW.archived_at IS NOT NULL AND NEW.is_published THEN RAISE EXCEPTION 'restore_archived_course_first'; END IF; RETURN NEW; END $$;
CREATE TRIGGER courses_archive_publication_guard BEFORE INSERT OR UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.prevent_archived_course_publication();

CREATE FUNCTION public.admin_student_progress(p_user_id uuid,p_course_ids uuid[]) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(row_to_json(r)),'[]'::jsonb) FROM (
   SELECT c.id course_id,count(l.id) total_lessons,count(lp.id) FILTER(WHERE lp.completed) completed_lessons,
    count(l.id)>0 AND count(l.id)=count(lp.id) FILTER(WHERE lp.completed) is_completed,max(cp.last_accessed_at) last_accessed_at
   FROM public.courses c LEFT JOIN public.lessons l ON l.course_id=c.id
   LEFT JOIN public.lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=p_user_id
   LEFT JOIN public.course_progress cp ON cp.course_id=c.id AND cp.user_id=p_user_id
   WHERE c.id=ANY(p_course_ids) GROUP BY c.id
 ) r;
$$;
REVOKE ALL ON FUNCTION public.admin_student_progress(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_student_progress(uuid,uuid[]) TO service_role;
