ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS preview_bunny_video_id text,
ADD COLUMN IF NOT EXISTS preview_bunny_library_id text,
ADD COLUMN IF NOT EXISTS preview_status text NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS pending_preview_bunny_video_id text,
ADD COLUMN IF NOT EXISTS pending_preview_bunny_library_id text,
ADD COLUMN IF NOT EXISTS pending_preview_status text NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS preview_upload_error text;

ALTER TABLE public.lessons
ADD COLUMN IF NOT EXISTS bunny_status text NOT NULL DEFAULT 'ready',
ADD COLUMN IF NOT EXISTS pending_bunny_video_id text,
ADD COLUMN IF NOT EXISTS pending_bunny_library_id text,
ADD COLUMN IF NOT EXISTS pending_bunny_status text NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS video_upload_error text;

UPDATE public.lessons
SET bunny_status = 'ready'
WHERE bunny_video_id IS NOT NULL
  AND (bunny_status IS NULL OR bunny_status = '');

UPDATE public.courses
SET preview_status = 'legacy'
WHERE preview_video_url IS NOT NULL
  AND preview_bunny_video_id IS NULL
  AND preview_status = 'none';
