BEGIN;

UPDATE public.courses
SET short_description = NULL
WHERE short_description IS NOT NULL
  AND char_length(regexp_replace(btrim(short_description), '\s+', ' ', 'g')) < 20;

CREATE OR REPLACE FUNCTION public.instructor_specialties_are_valid(items text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    COALESCE(array_length(items, 1), 0) <= 10
    AND COALESCE(
      (
        SELECT bool_and(
          char_length(regexp_replace(btrim(item), '\s+', ' ', 'g')) BETWEEN 2 AND 40
        )
        FROM unnest(items) AS item
      ),
      true
    );
$$;

ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_price_check,
  DROP CONSTRAINT IF EXISTS courses_title_not_blank_check,
  DROP CONSTRAINT IF EXISTS courses_title_length_check,
  DROP CONSTRAINT IF EXISTS courses_short_description_length_check,
  DROP CONSTRAINT IF EXISTS courses_description_length_check,
  DROP CONSTRAINT IF EXISTS courses_fixed_discount_whole_peso_check;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_price_check
    CHECK (
      price >= 0
      AND price <= 9999999900
      AND (price % 100) = 0
    ),
  ADD CONSTRAINT courses_title_not_blank_check
    CHECK (char_length(btrim(title)) > 0),
  ADD CONSTRAINT courses_title_length_check
    CHECK (char_length(regexp_replace(btrim(title), '\s+', ' ', 'g')) <= 120),
  ADD CONSTRAINT courses_short_description_length_check
    CHECK (
      short_description IS NULL OR
      char_length(regexp_replace(btrim(short_description), '\s+', ' ', 'g')) BETWEEN 20 AND 200
    ),
  ADD CONSTRAINT courses_description_length_check
    CHECK (
      description IS NULL OR
      char_length(regexp_replace(btrim(description), '\s+', ' ', 'g')) <= 5000
    ),
  ADD CONSTRAINT courses_fixed_discount_whole_peso_check
    CHECK (
      course_discount_type IS DISTINCT FROM 'fixed' OR
      course_discount_value IS NULL OR
      (course_discount_value % 100) = 0
    );

ALTER TABLE public.instructors
  DROP CONSTRAINT IF EXISTS instructors_full_name_length_check,
  DROP CONSTRAINT IF EXISTS instructors_bio_length_check,
  DROP CONSTRAINT IF EXISTS instructors_years_experience_range_check,
  DROP CONSTRAINT IF EXISTS instructors_specialties_valid_check;

ALTER TABLE public.instructors
  ADD CONSTRAINT instructors_full_name_length_check
    CHECK (
      char_length(regexp_replace(btrim(full_name), '\s+', ' ', 'g')) BETWEEN 2 AND 80
    ),
  ADD CONSTRAINT instructors_bio_length_check
    CHECK (
      bio IS NULL OR
      char_length(regexp_replace(btrim(bio), '\s+', ' ', 'g')) <= 1000
    ),
  ADD CONSTRAINT instructors_years_experience_range_check
    CHECK (
      years_experience IS NULL OR
      years_experience BETWEEN 0 AND 80
    ),
  ADD CONSTRAINT instructors_specialties_valid_check
    CHECK (public.instructor_specialties_are_valid(specialties));

ALTER TABLE public.discount_rules
  DROP CONSTRAINT IF EXISTS discount_rules_name_length_check,
  DROP CONSTRAINT IF EXISTS discount_rules_fixed_discount_whole_peso_check;

ALTER TABLE public.discount_rules
  ADD CONSTRAINT discount_rules_name_length_check
    CHECK (
      char_length(regexp_replace(btrim(name), '\s+', ' ', 'g')) BETWEEN 1 AND 80
    ),
  ADD CONSTRAINT discount_rules_fixed_discount_whole_peso_check
    CHECK (
      discount_type IS DISTINCT FROM 'fixed' OR
      discount_value IS NULL OR
      (discount_value % 100) = 0
    );

COMMIT;
