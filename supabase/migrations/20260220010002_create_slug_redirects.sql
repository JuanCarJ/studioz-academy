-- H-06: Table for tracking slug changes with 301 redirects
CREATE TABLE IF NOT EXISTS public.slug_redirects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  old_slug text NOT NULL,
  new_slug text NOT NULL,
  entity_type text NOT NULL DEFAULT 'course',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slug_redirects_pkey PRIMARY KEY (id),
  CONSTRAINT slug_redirects_old_slug_entity_key UNIQUE (old_slug, entity_type)
);

ALTER TABLE public.slug_redirects ENABLE ROW LEVEL SECURITY;

-- Public read access for slug resolution
CREATE POLICY "slug_redirects_read_public"
  ON public.slug_redirects FOR SELECT
  TO authenticated, anon
  USING (true);
