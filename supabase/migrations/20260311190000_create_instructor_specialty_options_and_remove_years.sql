BEGIN;

CREATE TABLE IF NOT EXISTS public.instructor_specialty_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT instructor_specialty_options_pkey PRIMARY KEY (id),
  CONSTRAINT instructor_specialty_options_category_check
    CHECK (category IN ('baile', 'tatuaje')),
  CONSTRAINT instructor_specialty_options_name_length_check
    CHECK (
      char_length(regexp_replace(btrim(name), '\s+', ' ', 'g')) BETWEEN 2 AND 40
    ),
  CONSTRAINT instructor_specialty_options_normalized_name_not_blank_check
    CHECK (char_length(btrim(normalized_name)) > 0),
  CONSTRAINT instructor_specialty_options_category_normalized_name_key
    UNIQUE (category, normalized_name)
);

COMMENT ON TABLE public.instructor_specialty_options IS
  'Catalog of normalized instructor specialties grouped by category.';

CREATE INDEX IF NOT EXISTS idx_instructor_specialty_options_category
  ON public.instructor_specialty_options (category);

ALTER TABLE public.instructor_specialty_options ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON public.instructor_specialty_options;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.instructor_specialty_options
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "instructor_specialty_options_select_all"
  ON public.instructor_specialty_options;
CREATE POLICY "instructor_specialty_options_select_all"
  ON public.instructor_specialty_options
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "instructor_specialty_options_admin_all"
  ON public.instructor_specialty_options;
CREATE POLICY "instructor_specialty_options_admin_all"
  ON public.instructor_specialty_options
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DO $$
DECLARE
  instructor_record record;
  inferred_categories text[];
BEGIN
  FOR instructor_record IN
    SELECT id, full_name, specialties
    FROM public.instructors
    WHERE COALESCE(array_length(specialties, 1), 0) > 0
  LOOP
    SELECT array_agg(DISTINCT courses.category ORDER BY courses.category)
    INTO inferred_categories
    FROM public.courses
    WHERE courses.instructor_id = instructor_record.id;

    IF COALESCE(array_length(inferred_categories, 1), 0) <> 1 THEN
      RAISE EXCEPTION
        'No se pudo inferir la categoria de las especialidades del instructor % (%). Categorias detectadas: %',
        instructor_record.full_name,
        instructor_record.id,
        COALESCE(array_to_string(inferred_categories, ', '), 'ninguna');
    END IF;
  END LOOP;
END $$;

INSERT INTO public.instructor_specialty_options (name, normalized_name, category)
SELECT DISTINCT
  initcap(lower(regexp_replace(btrim(specialty), '\s+', ' ', 'g'))) AS name,
  lower(
    translate(
      regexp_replace(btrim(specialty), '\s+', ' ', 'g'),
      'áéíóúüñÁÉÍÓÚÜÑ',
      'aeiouunAEIOUUN'
    )
  ) AS normalized_name,
  inferred.category
FROM public.instructors AS instructors
CROSS JOIN LATERAL unnest(instructors.specialties) AS specialty
CROSS JOIN LATERAL (
  SELECT courses.category
  FROM public.courses AS courses
  WHERE courses.instructor_id = instructors.id
  GROUP BY courses.category
) AS inferred
ON CONFLICT (category, normalized_name) DO UPDATE
SET name = EXCLUDED.name;

UPDATE public.instructors AS instructors
SET specialties = COALESCE(
  (
    SELECT array_agg(mapped_option.name ORDER BY mapped_option.name)
    FROM (
      SELECT courses.category
      FROM public.courses AS courses
      WHERE courses.instructor_id = instructors.id
      GROUP BY courses.category
    ) AS inferred
    CROSS JOIN LATERAL (
      SELECT DISTINCT ON (mapped_option.normalized_name)
        mapped_option.normalized_name,
        mapped_option.name
      FROM unnest(instructors.specialties) AS specialty
      CROSS JOIN LATERAL (
        SELECT
          lower(
            translate(
              regexp_replace(btrim(specialty), '\s+', ' ', 'g'),
              'áéíóúüñÁÉÍÓÚÜÑ',
              'aeiouunAEIOUUN'
            )
          ) AS normalized_name
      ) AS normalized
      JOIN LATERAL (
        SELECT options.name, options.normalized_name
        FROM public.instructor_specialty_options AS options
        WHERE options.category = inferred.category
          AND options.normalized_name = normalized.normalized_name
        LIMIT 1
      ) AS mapped_option ON true
      ORDER BY mapped_option.normalized_name, mapped_option.name
    ) AS mapped_option
  ),
  ARRAY[]::text[]
);

ALTER TABLE public.instructors
  DROP CONSTRAINT IF EXISTS instructors_years_experience_range_check;

ALTER TABLE public.instructors
  DROP COLUMN IF EXISTS years_experience;

COMMIT;
