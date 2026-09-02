-- Deferred only. This table is NOT authority to delete provider assets.
-- Any future deletion worker must prevent concurrent attachment as well as
-- checking all active/pending references; a read before DELETE is insufficient.
create table public.bunny_cleanup_queue (
  library_id text not null,
  video_id text not null,
  status text not null default 'deferred' check (status = 'deferred'),
  requested_at timestamptz not null default now(),
  primary key (library_id, video_id)
);
alter table public.bunny_cleanup_queue enable row level security;
revoke all on public.bunny_cleanup_queue from public, anon, authenticated;
grant select, insert, update, delete on public.bunny_cleanup_queue to service_role;

create index courses_bunny_reconcile_work_idx
  on public.courses (preview_last_checked_at asc nulls first, id)
  where pending_preview_bunny_video_id is not null
    or preview_status in ('processing', 'error')
    or pending_preview_status in ('processing', 'error');
create index lessons_bunny_reconcile_work_idx
  on public.lessons (bunny_last_checked_at asc nulls first, id)
  where pending_bunny_video_id is not null or bunny_status <> 'ready';
create index courses_active_bunny_video_idx on public.courses (preview_bunny_video_id)
  where preview_bunny_video_id is not null;
create index courses_pending_bunny_video_idx on public.courses (pending_preview_bunny_video_id)
  where pending_preview_bunny_video_id is not null;
create index lessons_active_bunny_video_idx on public.lessons (bunny_video_id);
create index lessons_pending_bunny_video_idx on public.lessons (pending_bunny_video_id)
  where pending_bunny_video_id is not null;
