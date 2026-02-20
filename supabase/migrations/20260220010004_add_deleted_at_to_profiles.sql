-- H-11: Add deleted_at column for soft-delete / anonymization tracking
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.profiles.deleted_at IS 'Timestamp when user data was anonymized via account deletion request';
