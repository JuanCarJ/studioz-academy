-- Preserve an explicit support revocation across provider retries.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
CREATE TABLE public.enrollment_blocks (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
 blocked_by uuid NOT NULL REFERENCES public.profiles(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,course_id)
);
ALTER TABLE public.enrollment_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enrollment_blocks FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.enrollment_blocks TO service_role;
