-- Local artifact only: manually named after the approved wrapper failed closed.
-- Not applied or verified against any database in this implementation.
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN auth_cleanup_completed_at timestamptz,
  ADD COLUMN auth_cleanup_started_at timestamptz,
  ADD COLUMN auth_cleanup_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN auth_cleanup_error text,
  ADD CONSTRAINT profiles_auth_cleanup_attempts_check CHECK (auth_cleanup_attempts >= 0),
  ADD CONSTRAINT profiles_auth_cleanup_completion_check
    CHECK (auth_cleanup_completed_at IS NULL OR deleted_at IS NOT NULL),
  ADD CONSTRAINT profiles_auth_cleanup_error_check CHECK (auth_cleanup_error IS NULL OR
    auth_cleanup_error IN ('auth_rate_limited', 'auth_unavailable', 'auth_rejected', 'auth_transport_error'));

-- Existing deleted profiles also constitute durable pending work. Never infer
-- that the external Auth operation completed merely from deleted_at.
-- The existing column-level UPDATE grant remains limited to editable profile
-- fields: these operational fields are writable only through the service role.
REVOKE UPDATE (auth_cleanup_completed_at, auth_cleanup_started_at,
  auth_cleanup_attempts, auth_cleanup_error) ON public.profiles FROM anon, authenticated;

CREATE INDEX profiles_pending_auth_cleanup_idx ON public.profiles (deleted_at, id)
  WHERE deleted_at IS NOT NULL AND auth_cleanup_completed_at IS NULL;

COMMIT;
