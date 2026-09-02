-- Local-only candidate. Requires authorized staging execution and concurrency validation.
-- Expand: historical Wompi columns remain untouched. No financial provider calls.
BEGIN;

ALTER TABLE public.orders
  ADD COLUMN payment_provider text NOT NULL DEFAULT 'wompi' CHECK (payment_provider IN ('wompi','bold','internal')),
  ADD COLUMN payment_environment text NOT NULL DEFAULT 'legacy' CHECK (payment_environment IN ('legacy','sandbox','production')),
  ADD COLUMN provider_transaction_id text,
  ADD COLUMN provider_status text,
  ADD COLUMN payment_checked_at timestamptz;
CREATE UNIQUE INDEX orders_provider_transaction_unique ON public.orders(payment_provider, payment_environment, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
ALTER TABLE public.payment_events
  ADD COLUMN payment_provider text NOT NULL DEFAULT 'wompi',
  ADD COLUMN provider_event_id text,
  ADD COLUMN provider_transaction_id text;

CREATE TABLE public.checkout_idempotency (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cart_hash text NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id),
  PRIMARY KEY(user_id, cart_hash)
);
ALTER TABLE public.checkout_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_idempotency FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.checkout_idempotency TO service_role;

CREATE TABLE public.job_leases (
  name text PRIMARY KEY,
  token uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.job_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_leases FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.job_leases TO service_role;

CREATE TABLE public.payment_notification_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_json jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text
);
ALTER TABLE public.payment_notification_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_notification_inbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_notification_inbox TO service_role;
CREATE INDEX payment_inbox_ready ON public.payment_notification_inbox(next_attempt_at, received_at) WHERE processed_at IS NULL;

ALTER TABLE public.order_email_outbox
  ADD COLUMN lease_token uuid,
  ADD COLUMN leased_until timestamptz,
  ADD COLUMN delivery_version integer NOT NULL DEFAULT 1,
  ADD COLUMN delivery_started_at timestamptz;

-- Functions are SECURITY INVOKER and service-role-only; never browser-callable.
CREATE FUNCTION public.apply_approved_order_effects(p_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE o public.orders%ROWTYPE; owner_id uuid;
BEGIN
  SELECT user_id INTO owner_id FROM public.orders WHERE id=p_order_id;
  IF owner_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('entitlement:'||owner_id::text,0)); END IF;
  SELECT * INTO STRICT o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF o.user_id IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'Order owner changed'; END IF;
  IF o.status <> 'approved' THEN RAISE EXCEPTION 'Order not approved'; END IF;
  IF o.user_id IS NOT NULL THEN
    INSERT INTO public.enrollments(user_id,course_id,source,order_id)
      SELECT o.user_id, oi.course_id, 'purchase', o.id FROM public.order_items oi
      WHERE oi.order_id=o.id AND oi.course_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM public.enrollment_blocks b WHERE b.user_id=o.user_id AND b.course_id=oi.course_id)
        -- A temporary suspension blocks use via active-account RLS, not paid
        -- ownership. Preserve this entitlement for a later account resume.
        AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=o.user_id AND p.deleted_at IS NULL)
      ON CONFLICT (user_id,course_id) DO NOTHING;
    INSERT INTO public.course_progress(user_id,course_id)
      SELECT o.user_id, oi.course_id FROM public.order_items oi
      WHERE oi.order_id=o.id AND oi.course_id IS NOT NULL
        AND EXISTS(SELECT 1 FROM public.enrollments e WHERE e.user_id=o.user_id AND e.course_id=oi.course_id)
      ON CONFLICT (user_id,course_id) DO NOTHING;
    DELETE FROM public.cart_items ci WHERE ci.user_id=o.user_id
      AND ci.course_id IN (SELECT course_id FROM public.order_items WHERE order_id=o.id);
  END IF;
  INSERT INTO public.order_email_outbox(order_id) VALUES(o.id) ON CONFLICT (order_id) DO NOTHING;
  RETURN true;
END $$;

CREATE FUNCTION public.enroll_native_free_course(p_user_id uuid,p_course_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('entitlement:'||p_user_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND deleted_at IS NULL AND suspended_at IS NULL)
    OR EXISTS(SELECT 1 FROM public.enrollment_blocks WHERE user_id=p_user_id AND course_id=p_course_id) THEN RETURN false; END IF;
  PERFORM 1 FROM public.courses WHERE id=p_course_id AND is_free AND is_published FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.enrollments(user_id,course_id,source) VALUES(p_user_id,p_course_id,'free') ON CONFLICT(user_id,course_id) DO NOTHING;
  INSERT INTO public.course_progress(user_id,course_id) VALUES(p_user_id,p_course_id) ON CONFLICT(user_id,course_id) DO NOTHING;
  RETURN true;
END $$;

CREATE FUNCTION public.create_checkout_order(p_user_id uuid,p_cart_hash text,p_order jsonb,p_items jsonb,p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE o public.orders%ROWTYPE; v_id uuid; v_total integer; v_list integer; v_course integer; v_combo integer; n integer;
BEGIN
  IF p_user_id IS NULL OR p_cart_hash IS NULL OR length(p_cart_hash)<>64
     OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100
     OR jsonb_typeof(p_lines)<>'array' THEN RAISE EXCEPTION 'Invalid checkout'; END IF;
  -- User-wide lock also serializes two different carts that overlap the same course.
  PERFORM pg_advisory_xact_lock(hashtextextended('checkout:'||p_user_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('entitlement:'||p_user_id::text,0));
  PERFORM 1 FROM public.profiles WHERE id=p_user_id AND deleted_at IS NULL AND suspended_at IS NULL FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable'; END IF;
  SELECT count(DISTINCT i->>'courseId'),sum((i->>'finalPrice')::integer),sum((i->>'listPrice')::integer),
    sum((i->>'courseDiscountAmount')::integer),sum((i->>'comboDiscountAmount')::integer)
    INTO n,v_total,v_list,v_course,v_combo FROM jsonb_array_elements(p_items) i;
  IF n<>jsonb_array_length(p_items) OR v_total IS NULL OR v_total<0
     OR v_total<>v_list-v_course-v_combo OR v_total<>(p_order->>'total')::integer
     OR v_list<>(p_order->>'list_subtotal')::integer OR v_course<>(p_order->>'course_discount_amount')::integer
     OR v_combo<>(p_order->>'combo_discount_amount')::integer THEN RAISE EXCEPTION 'Invalid totals'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) i
    WHERE (i->>'listPrice')::integer<0 OR (i->>'courseDiscountAmount')::integer<0 OR (i->>'comboDiscountAmount')::integer<0
       OR (i->>'finalPrice')::integer<0
       OR (i->>'listPrice')::integer-(i->>'courseDiscountAmount')::integer<>(i->>'priceAfterCourseDiscount')::integer
       OR (i->>'priceAfterCourseDiscount')::integer-(i->>'comboDiscountAmount')::integer<>(i->>'finalPrice')::integer)
    THEN RAISE EXCEPTION 'Invalid item totals'; END IF;
  -- Server computes pricing; database verifies purchasability under the same lock.
  PERFORM c.id FROM public.courses c JOIN jsonb_array_elements(p_items) i ON c.id=(i->>'courseId')::uuid FOR SHARE OF c;
  IF (SELECT count(*) FROM public.courses c JOIN jsonb_array_elements(p_items) i ON c.id=(i->>'courseId')::uuid
        WHERE c.is_published AND NOT c.is_free)<>n THEN RAISE EXCEPTION 'Course unavailable'; END IF;
  IF EXISTS (SELECT 1 FROM public.enrollment_blocks b JOIN jsonb_array_elements(p_items) i ON b.course_id=(i->>'courseId')::uuid
        WHERE b.user_id=p_user_id) THEN RAISE EXCEPTION 'Access administratively blocked'; END IF;
  SELECT ord.* INTO o FROM public.checkout_idempotency k JOIN public.orders ord ON ord.id=k.order_id
    WHERE k.user_id=p_user_id AND k.cart_hash=p_cart_hash FOR UPDATE OF ord;
  -- Availability and tombstones are checked before returning any saved order.
  IF o.id IS NOT NULL AND o.status='approved' AND o.total=0 THEN
    RETURN jsonb_build_object('id',o.id,'reference',o.reference,'total',o.total,'status',o.status);
  END IF;
  IF EXISTS (SELECT 1 FROM public.enrollments e JOIN jsonb_array_elements(p_items) i ON e.course_id=(i->>'courseId')::uuid
        WHERE e.user_id=p_user_id) THEN RAISE EXCEPTION 'Already enrolled'; END IF;
  IF o.id IS NOT NULL AND o.status='pending' AND o.payment_provider='bold'
       AND o.payment_environment=p_order->>'payment_environment' THEN
    RETURN jsonb_build_object('id',o.id,'reference',o.reference,'total',o.total,'status',o.status);
  END IF;
  INSERT INTO public.orders(user_id,reference,customer_name_snapshot,customer_email_snapshot,customer_phone_snapshot,
    list_subtotal,subtotal,course_discount_amount,combo_discount_amount,discount_amount,total,discount_rule_id,
    discount_rule_name_snapshot,pricing_snapshot_json,status,payment_method,approved_at,cart_hash,payment_provider,payment_environment)
    VALUES(p_user_id,p_order->>'reference',p_order->>'customer_name_snapshot',p_order->>'customer_email_snapshot',
      p_order->>'customer_phone_snapshot',v_list,v_list-v_course,v_course,v_combo,v_course+v_combo,v_total,
      (p_order->>'discount_rule_id')::uuid,p_order->>'discount_rule_name_snapshot',p_order->'pricing_snapshot_json',
      CASE WHEN v_total=0 THEN 'approved' ELSE 'pending' END,CASE WHEN v_total=0 THEN 'promo' END,
      CASE WHEN v_total=0 THEN now() END,p_cart_hash,CASE WHEN v_total=0 THEN 'internal' ELSE 'bold' END,
      p_order->>'payment_environment') RETURNING * INTO o;
  INSERT INTO public.order_items(order_id,course_id,course_title_snapshot,price_at_purchase,list_price_snapshot,
    course_discount_amount_snapshot,price_after_course_discount_snapshot,combo_discount_amount_snapshot,final_price_snapshot)
    SELECT o.id,(i->>'courseId')::uuid,i->>'courseTitle',(i->>'listPrice')::integer,(i->>'listPrice')::integer,
      (i->>'courseDiscountAmount')::integer,(i->>'priceAfterCourseDiscount')::integer,
      (i->>'comboDiscountAmount')::integer,(i->>'finalPrice')::integer FROM jsonb_array_elements(p_items) i;
  INSERT INTO public.order_discount_lines(order_id,scope,kind,source_id,source_name_snapshot,course_id,course_title_snapshot,amount,metadata_json)
    SELECT o.id,l->>'scope',l->>'kind',(l->>'source_id')::uuid,l->>'source_name',(l->>'course_id')::uuid,
      l->>'course_title',(l->>'amount')::integer,coalesce(l->'metadata','{}'::jsonb) FROM jsonb_array_elements(p_lines) l;
  IF coalesce((SELECT sum(amount) FROM public.order_discount_lines WHERE order_id=o.id),0)<>v_course+v_combo
    THEN RAISE EXCEPTION 'Discount lines mismatch'; END IF;
  INSERT INTO public.checkout_idempotency(user_id,cart_hash,order_id) VALUES(p_user_id,p_cart_hash,o.id)
    ON CONFLICT(user_id,cart_hash) DO UPDATE SET order_id=EXCLUDED.order_id;
  IF v_total=0 THEN PERFORM public.apply_approved_order_effects(o.id); END IF;
  RETURN jsonb_build_object('id',o.id,'reference',o.reference,'total',o.total,'status',o.status);
END $$;

CREATE FUNCTION public.get_payable_checkout_order(p_reference text,p_user_id uuid,p_environment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; summary jsonb; reason text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('entitlement:'||p_user_id::text,0));
  SELECT * INTO o FROM public.orders WHERE reference=p_reference AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('order',NULL,'eligible',false,'reason','not_found'); END IF;
  summary:=jsonb_build_object('id',o.id,'reference',o.reference,'status',o.status,'total',o.total,'created_at',o.created_at);
  IF o.status<>'pending' THEN RETURN jsonb_build_object('order',summary,'eligible',false,'reason','status'); END IF;
  IF o.payment_provider<>'bold' OR o.payment_environment<>p_environment THEN reason:='provider_mismatch';
  ELSIF o.created_at<=now()-interval '23 hours' THEN reason:='expired';
  ELSIF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND deleted_at IS NULL AND suspended_at IS NULL)
    THEN reason:='account_unavailable';
  ELSE
    PERFORM c.id FROM public.order_items oi JOIN public.courses c ON c.id=oi.course_id WHERE oi.order_id=o.id FOR SHARE OF c;
    IF NOT EXISTS(SELECT 1 FROM public.order_items WHERE order_id=o.id) OR EXISTS(
      SELECT 1 FROM public.order_items oi LEFT JOIN public.courses c ON c.id=oi.course_id WHERE oi.order_id=o.id
        AND (c.id IS NULL OR NOT c.is_published OR c.is_free
          OR EXISTS(SELECT 1 FROM public.enrollment_blocks b WHERE b.user_id=p_user_id AND b.course_id=oi.course_id)
          OR EXISTS(SELECT 1 FROM public.enrollments e WHERE e.user_id=p_user_id AND e.course_id=oi.course_id)))
      THEN reason:='items_unavailable'; END IF;
  END IF;
  RETURN jsonb_build_object('order',summary,'eligible',reason IS NULL,'reason',reason);
END $$;

CREATE FUNCTION public.apply_payment_event(p_event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE o public.orders%ROWTYPE; owner_id uuid; eid uuid; next_status text; why text; applied boolean:=false; event_key text;
BEGIN
  SELECT user_id INTO owner_id FROM public.orders WHERE reference=p_event->>'reference';
  IF owner_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('entitlement:'||owner_id::text,0)); END IF;
  SELECT * INTO STRICT o FROM public.orders WHERE reference=p_event->>'reference' FOR UPDATE;
  IF o.user_id IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'Order owner changed'; END IF;
  event_key := (p_event->>'provider')||':'||(p_event->>'environment')||':'||(p_event->>'eventId');
  next_status := CASE p_event->>'status'
    WHEN 'APPROVED' THEN 'approved' WHEN 'SALE_APPROVED' THEN 'approved'
    WHEN 'PENDING' THEN 'pending' WHEN 'PROCESSING' THEN 'pending'
    WHEN 'DECLINED' THEN 'declined' WHEN 'REJECTED' THEN 'declined'
    WHEN 'SALE_REJECTED' THEN 'declined' WHEN 'ERROR' THEN 'declined' WHEN 'FAILED' THEN 'declined'
    WHEN 'VOIDED' THEN 'voided' WHEN 'VOID_APPROVED' THEN 'voided' ELSE 'unknown' END;
  INSERT INTO public.payment_events(order_id,source,payload_hash,payload_json,external_status,mapped_status,
    payment_provider,provider_event_id,provider_transaction_id)
    VALUES(o.id,p_event->>'source',event_key,p_event,p_event->>'status',next_status,p_event->>'provider',
      p_event->>'eventId',p_event->>'transactionId')
    ON CONFLICT(payload_hash) DO NOTHING RETURNING id INTO eid;
  IF eid IS NULL THEN RETURN jsonb_build_object('duplicate',true,'applied',false,'status',o.status); END IF;
  IF o.payment_provider<>p_event->>'provider' OR o.payment_environment<>p_event->>'environment'
    OR o.total IS DISTINCT FROM (p_event->>'amountInCents')::integer OR o.currency IS DISTINCT FROM p_event->>'currency'
    OR nullif(p_event->>'transactionId','') IS NULL THEN why:='order_mismatch';
  ELSIF next_status='unknown' THEN why:='unknown_status';
  ELSIF o.status IN ('refunded','chargeback','voided') THEN why:='terminal_order';
  ELSIF o.status='approved' AND (next_status NOT IN ('approved','voided')
    OR coalesce(o.provider_transaction_id,o.wompi_transaction_id) IS DISTINCT FROM p_event->>'transactionId') THEN why:='stale_event';
  ELSIF o.status='declined' AND next_status NOT IN ('declined','approved') THEN why:='stale_event';
  ELSE
    UPDATE public.orders SET status=next_status,provider_transaction_id=p_event->>'transactionId',
      provider_status=p_event->>'status',payment_method=coalesce(p_event->>'paymentMethod',payment_method),
      wompi_transaction_id=CASE WHEN payment_provider='wompi' THEN p_event->>'transactionId' ELSE wompi_transaction_id END,
      approved_at=CASE WHEN next_status='approved' THEN coalesce(approved_at,now()) ELSE approved_at END,
      reverted_at=CASE WHEN next_status='voided' THEN now() ELSE reverted_at END,updated_at=now() WHERE id=o.id;
    IF next_status='approved' THEN PERFORM public.apply_approved_order_effects(o.id); END IF;
    IF next_status='voided' AND o.status='approved' THEN
      DELETE FROM public.enrollments WHERE order_id=o.id AND source='purchase';
      INSERT INTO public.enrollments(user_id,course_id,source,order_id)
        SELECT DISTINCT ON (oi.course_id) o.user_id,oi.course_id,'purchase',other.id
        FROM public.orders other JOIN public.order_items oi ON oi.order_id=other.id
        WHERE other.user_id=o.user_id AND other.status='approved' AND other.id<>o.id AND oi.course_id IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM public.enrollment_blocks b WHERE b.user_id=o.user_id AND b.course_id=oi.course_id)
        ORDER BY oi.course_id,other.approved_at DESC NULLS LAST,other.id
        ON CONFLICT(user_id,course_id) DO NOTHING;
    END IF;
    applied:=true;
  END IF;
  UPDATE public.payment_events SET is_applied=applied,reason=why WHERE id=eid;
  RETURN jsonb_build_object('duplicate',false,'applied',applied,'status',CASE WHEN applied THEN next_status ELSE o.status END,'reason',why);
END $$;

CREATE FUNCTION public.receive_payment_notification(p_event jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF nullif(p_event->>'eventId','') IS NULL OR nullif(p_event->>'reference','') IS NULL THEN RAISE EXCEPTION 'Invalid notification'; END IF;
  INSERT INTO public.payment_notification_inbox(event_key,event_json)
    VALUES((p_event->>'provider')||':'||(p_event->>'environment')||':'||(p_event->>'eventId'),p_event)
    ON CONFLICT(event_key) DO NOTHING;
  RETURN true;
END $$;

CREATE FUNCTION public.process_payment_notifications(p_limit integer DEFAULT 20,p_bold_environment text DEFAULT NULL,p_wompi_enabled boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r record; result jsonb; processed integer:=0; failed integer:=0;
BEGIN
  FOR r IN SELECT * FROM public.payment_notification_inbox WHERE processed_at IS NULL AND attempts<5 AND next_attempt_at<=now()
    AND ((event_json->>'provider'='bold' AND event_json->>'environment'=p_bold_environment)
      OR (event_json->>'provider'='wompi' AND p_wompi_enabled))
    ORDER BY next_attempt_at,received_at,id LIMIT greatest(1,least(p_limit,50)) FOR UPDATE SKIP LOCKED LOOP
    BEGIN
      result:=public.apply_payment_event(r.event_json);
      UPDATE public.payment_notification_inbox SET processed_at=now(),attempts=attempts+1,last_error=NULL WHERE id=r.id;
      processed:=processed+1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.payment_notification_inbox SET attempts=attempts+1,last_error=SQLSTATE,
        next_attempt_at=now()+interval '5 minutes' WHERE id=r.id;
      failed:=failed+1;
    END;
  END LOOP;
  RETURN jsonb_build_object('processed',processed,'failed',failed);
END $$;

CREATE FUNCTION public.claim_payment_recheck(p_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE public.orders SET payment_checked_at=now() WHERE id=p_order_id AND status='pending'
    AND (payment_checked_at IS NULL OR payment_checked_at<now()-interval '60 seconds');
  RETURN FOUND;
END $$;

CREATE FUNCTION public.claim_job_lease(p_name text,p_token uuid,p_seconds integer DEFAULT 90)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  INSERT INTO public.job_leases(name,token,expires_at) VALUES(p_name,p_token,now()+make_interval(secs=>greatest(30,least(p_seconds,300))))
    ON CONFLICT(name) DO UPDATE SET token=EXCLUDED.token,expires_at=EXCLUDED.expires_at WHERE job_leases.expires_at<now();
  RETURN FOUND;
END $$;
CREATE FUNCTION public.release_job_lease(p_name text,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  DELETE FROM public.job_leases WHERE name=p_name AND token=p_token;
  RETURN FOUND;
END $$;

CREATE FUNCTION public.claim_email_outbox(p_limit integer,p_token uuid)
RETURNS SETOF public.order_email_outbox LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- A provider idempotency key expires after 24h. Never automatically retry an
  -- ambiguous delivery beyond that window; require a deliberate admin resend.
  UPDATE public.order_email_outbox SET status='failed',last_error='delivery_window_expired',updated_at=now()
    WHERE status='pending' AND (delivery_started_at<now()-interval '23 hours' OR attempts>=5)
      AND (leased_until IS NULL OR leased_until<now());
  RETURN QUERY
    WITH candidates AS (
      SELECT id FROM public.order_email_outbox WHERE status='pending' AND attempts<5 AND next_attempt_at<=now()
        AND (leased_until IS NULL OR leased_until<now())
      ORDER BY next_attempt_at,id LIMIT greatest(1,least(p_limit,10)) FOR UPDATE SKIP LOCKED
    )
    UPDATE public.order_email_outbox e SET lease_token=p_token,leased_until=now()+interval '90 seconds',
      attempts=e.attempts+1,delivery_started_at=coalesce(e.delivery_started_at,now()),updated_at=now()
      FROM candidates c WHERE e.id=c.id RETURNING e.*;
END $$;

CREATE FUNCTION public.finish_email_outbox(p_id uuid,p_token uuid,p_sent boolean,p_delivery_version integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE public.order_email_outbox SET status=CASE WHEN p_sent THEN 'sent' WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,
    sent_at=CASE WHEN p_sent THEN now() ELSE sent_at END,
    next_attempt_at=now()+make_interval(secs=>least(1200,60*(2^least(attempts,5))::integer)),
    last_error=CASE WHEN p_sent THEN NULL ELSE 'delivery_unconfirmed' END,
    lease_token=NULL,leased_until=NULL,updated_at=now() WHERE id=p_id AND lease_token=p_token AND leased_until>now() AND delivery_version=p_delivery_version;
  RETURN FOUND;
END $$;

CREATE FUNCTION public.enqueue_purchase_email(p_order_id uuid,p_resend boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE o public.orders%ROWTYPE; owner_id uuid;
BEGIN
  SELECT user_id INTO owner_id FROM public.orders WHERE id=p_order_id;
  IF owner_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('entitlement:'||owner_id::text,0)); END IF;
  SELECT * INTO STRICT o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF o.user_id IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'Order owner changed'; END IF;
  IF o.status<>'approved' THEN RAISE EXCEPTION 'Order not approved'; END IF;
  INSERT INTO public.order_email_outbox(order_id) VALUES(p_order_id) ON CONFLICT(order_id) DO NOTHING;
  IF p_resend THEN
    UPDATE public.order_email_outbox SET status='pending',attempts=0,next_attempt_at=now(),last_error=NULL,
      delivery_version=delivery_version+1,delivery_started_at=NULL,sent_at=NULL,lease_token=NULL,leased_until=NULL,updated_at=now()
      WHERE order_id=p_order_id AND (leased_until IS NULL OR leased_until<now());
    IF NOT FOUND THEN RAISE EXCEPTION 'Delivery in progress'; END IF;
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.record_order_reversal(p_order_id uuid,p_actor_id uuid,p_status text,p_evidence text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE o public.orders%ROWTYPE; owner_id uuid;
BEGIN
  IF p_status IS NULL OR p_evidence IS NULL OR p_status NOT IN ('refunded','chargeback') OR length(trim(p_evidence)) NOT BETWEEN 8 AND 500
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND role='admin' AND deleted_at IS NULL AND suspended_at IS NULL)
    THEN RAISE EXCEPTION 'Invalid reversal record'; END IF;
  SELECT user_id INTO owner_id FROM public.orders WHERE id=p_order_id;
  IF owner_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('entitlement:'||owner_id::text,0)); END IF;
  SELECT * INTO STRICT o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF o.user_id IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'Order owner changed'; END IF;
  IF o.status=p_status THEN RETURN jsonb_build_object('applied',false,'status',o.status); END IF;
  IF o.status<>'approved' THEN RAISE EXCEPTION 'Order not approved'; END IF;
  UPDATE public.orders SET status=p_status,reverted_at=now(),updated_at=now() WHERE id=o.id;
  DELETE FROM public.enrollments WHERE order_id=o.id AND source='purchase';
  INSERT INTO public.enrollments(user_id,course_id,source,order_id)
    SELECT DISTINCT ON (oi.course_id) o.user_id,oi.course_id,'purchase',other.id
    FROM public.orders other JOIN public.order_items oi ON oi.order_id=other.id
    WHERE other.user_id=o.user_id AND other.status='approved' AND other.id<>o.id AND oi.course_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM public.enrollment_blocks b WHERE b.user_id=o.user_id AND b.course_id=oi.course_id)
    ORDER BY oi.course_id,other.approved_at DESC NULLS LAST,other.id
    ON CONFLICT(user_id,course_id) DO NOTHING;
  INSERT INTO public.payment_events(order_id,source,external_status,mapped_status,is_applied,payload_hash,payload_json,payment_provider)
    VALUES(o.id,'manual','CONFIRMED_'||upper(p_status),p_status,true,'manual:'||o.id||':'||p_status,
      jsonb_build_object('actorId',p_actor_id,'evidence',p_evidence,'moneyMoved',false),o.payment_provider);
  RETURN jsonb_build_object('applied',true,'status',p_status);
END $$;

-- Historical financial snapshots cannot be rewritten by support/reconciliation.
CREATE FUNCTION public.guard_order_financial_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF (to_jsonb(NEW)-ARRAY['status','provider_transaction_id','provider_status','payment_checked_at','payment_method',
      'payment_detail','wompi_transaction_id','approved_at','reverted_at','updated_at',
      'customer_name_snapshot','customer_email_snapshot','customer_phone_snapshot','is_user_anonymized','anonymized_at','user_id','discount_rule_id'])
     IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['status','provider_transaction_id','provider_status','payment_checked_at','payment_method',
      'payment_detail','wompi_transaction_id','approved_at','reverted_at','updated_at',
      'customer_name_snapshot','customer_email_snapshot','customer_phone_snapshot','is_user_anonymized','anonymized_at','user_id','discount_rule_id'])
    THEN RAISE EXCEPTION 'Immutable order financial snapshot'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_financial_snapshot BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_order_financial_snapshot();

CREATE FUNCTION public.guard_order_line_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  -- Allow only FK anonymization when the original course is eventually removed.
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'course_id') IS NOT DISTINCT FROM (to_jsonb(OLD)-'course_id')
      AND (NEW.course_id IS NULL OR NEW.course_id=OLD.course_id) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Immutable order line snapshot';
END $$;
CREATE TRIGGER order_items_snapshot BEFORE UPDATE OR DELETE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.guard_order_line_snapshot();
CREATE TRIGGER order_discount_lines_snapshot BEFORE UPDATE OR DELETE ON public.order_discount_lines FOR EACH ROW EXECUTE FUNCTION public.guard_order_line_snapshot();

REVOKE ALL ON FUNCTION public.get_payable_checkout_order(text,uuid,text),public.enroll_native_free_course(uuid,uuid),public.apply_approved_order_effects(uuid), public.create_checkout_order(uuid,text,jsonb,jsonb,jsonb),
  public.apply_payment_event(jsonb), public.receive_payment_notification(jsonb), public.process_payment_notifications(integer,text,boolean),
  public.claim_payment_recheck(uuid), public.claim_job_lease(text,uuid,integer), public.release_job_lease(text,uuid),
  public.claim_email_outbox(integer,uuid), public.finish_email_outbox(uuid,uuid,boolean,integer),
  public.enqueue_purchase_email(uuid,boolean), public.record_order_reversal(uuid,uuid,text,text),
  public.guard_order_financial_snapshot(),public.guard_order_line_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_payable_checkout_order(text,uuid,text),public.enroll_native_free_course(uuid,uuid),public.apply_approved_order_effects(uuid), public.create_checkout_order(uuid,text,jsonb,jsonb,jsonb),
  public.apply_payment_event(jsonb), public.receive_payment_notification(jsonb), public.process_payment_notifications(integer,text,boolean),
  public.claim_payment_recheck(uuid), public.claim_job_lease(text,uuid,integer), public.release_job_lease(text,uuid),
  public.claim_email_outbox(integer,uuid), public.finish_email_outbox(uuid,uuid,boolean,integer),
  public.enqueue_purchase_email(uuid,boolean), public.record_order_reversal(uuid,uuid,text,text) TO service_role;
COMMIT;
