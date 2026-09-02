-- Local artifact only. Promotional announcements are explicitly scheduled by an
-- active admin; no trigger fans out synchronously when a course is published.
create table public.course_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  course_id uuid references public.courses(id) on delete set null,
  lesson_id uuid references public.lessons(id) on delete set null,
  kind text not null check (kind in ('course', 'lesson')),
  course_title text not null,
  description text not null,
  course_url text not null,
  preferences_url text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  audience_cursor uuid,
  audience_complete boolean not null default false
);
create table public.course_email_outbox (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.course_email_campaigns(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  recipient_email text,
  status text not null default 'pending' check (status in ('pending','processing','sent','skipped','failed')),
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  sent_at timestamptz,
  provider_id text,
  last_error text,
  unique (campaign_id,user_id)
);
alter table public.course_email_campaigns enable row level security;
alter table public.course_email_outbox enable row level security;
revoke all on public.course_email_campaigns, public.course_email_outbox from public, anon, authenticated;
grant all on public.course_email_campaigns, public.course_email_outbox to service_role;
create index course_email_campaign_work_idx on public.course_email_campaigns(created_at,id) where not audience_complete;
create index course_email_pending_idx on public.course_email_outbox(next_attempt_at,id) where status in ('pending','processing');
create index course_email_user_idx on public.course_email_outbox(user_id);
create index course_email_campaign_course_idx on public.course_email_campaigns(course_id);

create function public.schedule_course_notification(p_actor_id uuid,p_course_id uuid,p_app_url text,p_lesson_id uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.courses; l public.lessons; campaign uuid; event text;
begin
  perform 1 from public.profiles where id=p_actor_id and role='admin' and deleted_at is null and suspended_at is null for share;
  if not found then raise exception 'admin_required'; end if;
  select * into c from public.courses where id=p_course_id and is_published and archived_at is null for share;
  if not found then raise exception 'published_course_required'; end if;
  if p_lesson_id is not null then
    select * into l from public.lessons where id=p_lesson_id and course_id=p_course_id and bunny_status='ready' for share;
    if not found then raise exception 'ready_lesson_required'; end if;
  end if;
  event := case when p_lesson_id is null then 'course:'||p_course_id::text else 'lesson:'||p_lesson_id::text end;
  insert into public.course_email_campaigns(event_key,course_id,lesson_id,kind,course_title,description,course_url,preferences_url,created_by)
  values(event,p_course_id,p_lesson_id,case when p_lesson_id is null then 'course' else 'lesson' end,c.title,
    case when p_lesson_id is null then coalesce(c.short_description,'') else l.title end,
    rtrim(p_app_url,'/') || case when p_lesson_id is null then '/cursos/'||c.slug else '/dashboard/cursos/'||c.slug||'?lesson='||p_lesson_id::text end,
    rtrim(p_app_url,'/')||'/dashboard/perfil',p_actor_id)
  on conflict(event_key) do nothing returning id into campaign;
  if campaign is null then select id into campaign from public.course_email_campaigns where event_key=event;
  else
    insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,after_data,result)
    values(p_actor_id,'notification.scheduled','course',p_course_id,jsonb_build_object('campaign_id',campaign,'kind',case when p_lesson_id is null then 'course' else 'lesson' end),'success');
  end if;
  return campaign;
end $$;

-- One campaign and at most 100 recipients per transaction; UUID keyset cursor.
-- Audience is bounded to profiles existing at scheduling time. Consent and
-- account/course/enrollment eligibility are checked again when claiming a send.
create function public.materialize_course_notification_batch(p_limit integer default 100)
-- SECURITY DEFINER is limited to these two internal service-role-only functions
-- because verified recipient addresses live in auth.users, not the Data API.
returns integer language plpgsql security definer set search_path='' as $$
declare c public.course_email_campaigns; r record; scanned integer:=0; inserted integer:=0; n integer;
begin
  select * into c from public.course_email_campaigns where not audience_complete order by created_at,id limit 1 for update skip locked;
  if not found then return 0; end if;
  if not exists(select 1 from public.courses where id=c.course_id and is_published and archived_at is null) then
    update public.course_email_campaigns set audience_complete=true where id=c.id; return 0;
  end if;
  for r in select p.id,u.email from public.profiles p join auth.users u on u.id=p.id
    where (c.audience_cursor is null or p.id>c.audience_cursor) and p.created_at<=c.created_at
      and p.role='user' and p.email_notifications and p.deleted_at is null and p.suspended_at is null
      and u.email_confirmed_at is not null and u.email is not null and (u.banned_until is null or u.banned_until<=now())
      and (c.kind='course' or exists(select 1 from public.enrollments e where e.course_id=c.course_id and e.user_id=p.id))
    order by p.id limit greatest(1,least(p_limit,100))
  loop
    insert into public.course_email_outbox(campaign_id,user_id,recipient_email) values(c.id,r.id,r.email) on conflict do nothing;
    get diagnostics n=row_count; inserted:=inserted+n; scanned:=scanned+1; c.audience_cursor:=r.id;
  end loop;
  update public.course_email_campaigns set audience_cursor=c.audience_cursor,
    audience_complete=scanned<greatest(1,least(p_limit,100)) where id=c.id;
  return inserted;
end $$;

create function public.claim_course_notifications(p_token uuid,p_limit integer default 3)
returns table(id uuid,recipient_email text,kind text,course_title text,description text,course_url text,preferences_url text,eligible boolean,retry_expired boolean)
language plpgsql security definer set search_path='' as $$
declare r public.course_email_outbox; c public.course_email_campaigns; allowed boolean; expired boolean;
begin
  for r in select q.* from public.course_email_outbox q
    where (q.status='pending' and q.next_attempt_at<=now()) or (q.status='processing' and q.lease_until<now())
    order by q.next_attempt_at,q.id limit greatest(1,least(p_limit,3)) for update skip locked
  loop
    select * into c from public.course_email_campaigns where course_email_campaigns.id=r.campaign_id;
    expired:=r.attempts>=5 or (r.first_attempt_at is not null and r.first_attempt_at<=now()-interval '23 hours');
    select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
      join public.courses course on course.id=c.course_id
      where p.id=r.user_id and p.role='user' and p.email_notifications and p.deleted_at is null and p.suspended_at is null
        and u.email=r.recipient_email and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
        and course.is_published and course.archived_at is null
        and (c.kind='course' or (exists(select 1 from public.lessons l where l.id=c.lesson_id and l.course_id=c.course_id and l.bunny_status='ready')
          and exists(select 1 from public.enrollments e where e.course_id=c.course_id and e.user_id=p.id)))) into allowed;
    update public.course_email_outbox q set status='processing',lease_token=p_token,lease_until=now()+interval '90 seconds',
      attempts=q.attempts+1,first_attempt_at=coalesce(q.first_attempt_at,now()) where q.id=r.id;
    return query select r.id,r.recipient_email,c.kind,c.course_title,c.description,c.course_url,c.preferences_url,allowed,expired;
  end loop;
end $$;

create function public.finish_course_notification(p_id uuid,p_token uuid,p_result text,p_provider_id text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if p_result not in ('sent','skipped','failed','expired') then raise exception 'invalid_result'; end if;
  update public.course_email_outbox q set
    status=case when p_result='failed' and attempts<5 and first_attempt_at>now()-interval '23 hours' then 'pending'
      when p_result='expired' then 'failed' else p_result end,
    next_attempt_at=now()+interval '2 minutes',lease_token=null,lease_until=null,
    sent_at=case when p_result='sent' then now() else null end,provider_id=p_provider_id,
    recipient_email=case when p_result in ('skipped','expired') then null else recipient_email end,
    last_error=case when p_result in ('failed','expired') then p_result else null end
    where q.id=p_id and q.lease_token=p_token and q.status='processing' and q.lease_until>now();
  get diagnostics n=row_count; return n=1;
end $$;

create function public.course_notification_stats(p_course_id uuid)
returns table(id uuid,kind text,description text,audience_complete boolean,scheduled bigint,sent bigint,skipped bigint,failed bigint,pending bigint)
language sql security invoker set search_path='' as $$
  select c.id,c.kind,c.description,c.audience_complete,count(q.id),count(q.id) filter(where q.status='sent'),
    count(q.id) filter(where q.status='skipped'),count(q.id) filter(where q.status='failed'),
    count(q.id) filter(where q.status in ('pending','processing'))
  from public.course_email_campaigns c left join public.course_email_outbox q on q.campaign_id=c.id
  where c.course_id=p_course_id group by c.id order by c.created_at desc limit 20;
$$;
revoke all on function public.schedule_course_notification(uuid,uuid,text,uuid), public.materialize_course_notification_batch(integer),
  public.claim_course_notifications(uuid,integer),public.finish_course_notification(uuid,uuid,text,text),public.course_notification_stats(uuid)
  from public,anon,authenticated;
grant execute on function public.schedule_course_notification(uuid,uuid,text,uuid), public.materialize_course_notification_batch(integer),
  public.claim_course_notifications(uuid,integer),public.finish_course_notification(uuid,uuid,text,text),public.course_notification_stats(uuid)
  to service_role;

-- Respect account deletion/withdrawn consent in queued work and erase the
-- address snapshot, including already completed work. Never logs recipient PII.
create function public.clear_course_notification_recipient()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    update public.course_email_outbox set recipient_email=null,
      status=case when status in ('pending','processing') then 'skipped' else status end,
      lease_token=null,lease_until=null where user_id=old.id;
    return old;
  end if;
  if new.deleted_at is not null or not new.email_notifications then
    update public.course_email_outbox set recipient_email=null,
      status=case when status in ('pending','processing') then 'skipped' else status end,
      lease_token=null,lease_until=null where user_id=new.id;
  end if;
  return new;
end $$;
revoke all on function public.clear_course_notification_recipient() from public,anon,authenticated;
create trigger clear_course_notification_recipient
after update of deleted_at,email_notifications on public.profiles
for each row execute function public.clear_course_notification_recipient();
create trigger clear_deleted_course_notification_recipient
before delete on public.profiles
for each row execute function public.clear_course_notification_recipient();
