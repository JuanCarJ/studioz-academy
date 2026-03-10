BEGIN;

CREATE TABLE IF NOT EXISTS public.event_images (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  image_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT event_images_pkey PRIMARY KEY (id),
  CONSTRAINT event_images_event_id_fkey
    FOREIGN KEY (event_id)
    REFERENCES public.events (id)
    ON DELETE CASCADE,
  CONSTRAINT event_images_sort_order_check CHECK (sort_order >= 0)
);

COMMENT ON TABLE public.event_images IS
  'Additional images published with events, ordered for public carousels.';

INSERT INTO public.event_images (event_id, image_url, sort_order)
SELECT events.id, events.image_url, 0
FROM public.events
WHERE events.image_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.event_images
    WHERE event_images.event_id = events.id
  );

ALTER TABLE public.event_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_images_select_published" ON public.event_images;
CREATE POLICY "event_images_select_published"
  ON public.event_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.events
      WHERE events.id = event_images.event_id
        AND events.is_published = true
    )
  );

DROP POLICY IF EXISTS "event_images_admin_all" ON public.event_images;
CREATE POLICY "event_images_admin_all"
  ON public.event_images
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS set_updated_at ON public.event_images;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.event_images
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_event_images_event_id
  ON public.event_images (event_id);

CREATE INDEX IF NOT EXISTS idx_event_images_sort_order
  ON public.event_images (event_id, sort_order, created_at);

COMMIT;
