ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS preview_last_checked_at timestamptz,
ADD COLUMN IF NOT EXISTS preview_last_state_changed_at timestamptz;

ALTER TABLE public.lessons
ADD COLUMN IF NOT EXISTS bunny_last_checked_at timestamptz,
ADD COLUMN IF NOT EXISTS bunny_last_state_changed_at timestamptz;

UPDATE public.courses
SET preview_last_state_changed_at = COALESCE(updated_at, now())
WHERE preview_last_state_changed_at IS NULL
  AND (
    preview_status IN ('processing', 'error')
    OR pending_preview_status IN ('processing', 'error')
  );

UPDATE public.lessons
SET bunny_last_state_changed_at = COALESCE(updated_at, now())
WHERE bunny_last_state_changed_at IS NULL
  AND (
    bunny_status IN ('processing', 'error')
    OR pending_bunny_status IN ('processing', 'error')
  );
