BEGIN;

CREATE TABLE IF NOT EXISTS public.post_images (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  image_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT post_images_pkey PRIMARY KEY (id),
  CONSTRAINT post_images_post_id_fkey
    FOREIGN KEY (post_id)
    REFERENCES public.posts (id)
    ON DELETE CASCADE,
  CONSTRAINT post_images_sort_order_check CHECK (sort_order >= 0)
);

COMMENT ON TABLE public.post_images IS
  'Additional images published with posts, ordered for public detail galleries.';

INSERT INTO public.post_images (post_id, image_url, sort_order)
SELECT posts.id, posts.cover_image_url, 0
FROM public.posts
WHERE posts.cover_image_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.post_images
    WHERE post_images.post_id = posts.id
  );

ALTER TABLE public.post_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_images_select_published" ON public.post_images;
CREATE POLICY "post_images_select_published"
  ON public.post_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts
      WHERE posts.id = post_images.post_id
        AND posts.is_published = true
    )
  );

DROP POLICY IF EXISTS "post_images_admin_all" ON public.post_images;
CREATE POLICY "post_images_admin_all"
  ON public.post_images
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS set_updated_at ON public.post_images;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.post_images
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_post_images_post_id
  ON public.post_images (post_id);

CREATE INDEX IF NOT EXISTS idx_post_images_sort_order
  ON public.post_images (post_id, sort_order, created_at);

COMMIT;
