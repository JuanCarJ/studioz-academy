BEGIN;

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS course_discount_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS course_discount_type text,
  ADD COLUMN IF NOT EXISTS course_discount_value integer;

ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_course_discount_type_check,
  DROP CONSTRAINT IF EXISTS courses_course_discount_value_check,
  DROP CONSTRAINT IF EXISTS courses_course_discount_configuration_check;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_course_discount_type_check
    CHECK (
      course_discount_type IS NULL OR
      course_discount_type IN ('percentage', 'fixed')
    ),
  ADD CONSTRAINT courses_course_discount_value_check
    CHECK (
      course_discount_value IS NULL OR
      course_discount_value > 0
    ),
  ADD CONSTRAINT courses_course_discount_configuration_check
    CHECK (
      (
        course_discount_enabled = false AND
        course_discount_type IS NULL AND
        course_discount_value IS NULL
      ) OR (
        course_discount_enabled = true AND
        is_free = false AND
        course_discount_type IS NOT NULL AND
        course_discount_value IS NOT NULL AND
        (
          (course_discount_type = 'percentage' AND course_discount_value BETWEEN 1 AND 100) OR
          (course_discount_type = 'fixed' AND course_discount_value <= price)
        )
      )
    );

UPDATE public.courses
SET
  course_discount_enabled = false,
  course_discount_type = NULL,
  course_discount_value = NULL
WHERE is_free = true;

ALTER TABLE public.discount_rules
  ADD COLUMN IF NOT EXISTS combo_kind text NOT NULL DEFAULT 'threshold_discount',
  ADD COLUMN IF NOT EXISTS buy_quantity integer,
  ADD COLUMN IF NOT EXISTS free_quantity integer;

ALTER TABLE public.discount_rules
  ALTER COLUMN discount_type DROP NOT NULL,
  ALTER COLUMN discount_value DROP NOT NULL,
  ALTER COLUMN discount_value DROP DEFAULT;

ALTER TABLE public.discount_rules
  DROP CONSTRAINT IF EXISTS discount_rules_discount_type_check,
  DROP CONSTRAINT IF EXISTS discount_rules_discount_value_check,
  DROP CONSTRAINT IF EXISTS discount_rules_min_courses_check,
  DROP CONSTRAINT IF EXISTS discount_rules_combo_kind_check,
  DROP CONSTRAINT IF EXISTS discount_rules_configuration_check;

ALTER TABLE public.discount_rules
  ADD CONSTRAINT discount_rules_discount_type_check
    CHECK (
      discount_type IS NULL OR
      discount_type IN ('percentage', 'fixed')
    ),
  ADD CONSTRAINT discount_rules_discount_value_check
    CHECK (
      discount_value IS NULL OR
      discount_value > 0
    ),
  ADD CONSTRAINT discount_rules_min_courses_check
    CHECK (
      min_courses >= 2
    ),
  ADD CONSTRAINT discount_rules_combo_kind_check
    CHECK (
      combo_kind IN ('threshold_discount', 'buy_x_get_y')
    ),
  ADD CONSTRAINT discount_rules_configuration_check
    CHECK (
      (
        combo_kind = 'threshold_discount' AND
        discount_type IS NOT NULL AND
        discount_value IS NOT NULL AND
        (
          (discount_type = 'percentage' AND discount_value BETWEEN 1 AND 100) OR
          (discount_type = 'fixed' AND discount_value > 0)
        ) AND
        buy_quantity IS NULL AND
        free_quantity IS NULL
      ) OR (
        combo_kind = 'buy_x_get_y' AND
        discount_type IS NULL AND
        discount_value IS NULL AND
        buy_quantity IS NOT NULL AND
        free_quantity IS NOT NULL AND
        buy_quantity >= 1 AND
        free_quantity >= 1 AND
        (buy_quantity + free_quantity) >= 2 AND
        min_courses = (buy_quantity + free_quantity)
      )
    );

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS list_subtotal integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS course_discount_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS combo_discount_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pricing_snapshot_json jsonb;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_list_subtotal_check,
  DROP CONSTRAINT IF EXISTS orders_course_discount_amount_check,
  DROP CONSTRAINT IF EXISTS orders_combo_discount_amount_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_list_subtotal_check CHECK (list_subtotal >= 0),
  ADD CONSTRAINT orders_course_discount_amount_check CHECK (course_discount_amount >= 0),
  ADD CONSTRAINT orders_combo_discount_amount_check CHECK (combo_discount_amount >= 0);

UPDATE public.orders
SET
  list_subtotal = subtotal,
  course_discount_amount = 0,
  combo_discount_amount = discount_amount
WHERE list_subtotal = 0
  AND course_discount_amount = 0
  AND combo_discount_amount = 0;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS list_price_snapshot integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS course_discount_amount_snapshot integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_after_course_discount_snapshot integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS combo_discount_amount_snapshot integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_price_snapshot integer NOT NULL DEFAULT 0;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_list_price_snapshot_check,
  DROP CONSTRAINT IF EXISTS order_items_course_discount_amount_snapshot_check,
  DROP CONSTRAINT IF EXISTS order_items_price_after_course_discount_snapshot_check,
  DROP CONSTRAINT IF EXISTS order_items_combo_discount_amount_snapshot_check,
  DROP CONSTRAINT IF EXISTS order_items_final_price_snapshot_check;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_list_price_snapshot_check CHECK (list_price_snapshot >= 0),
  ADD CONSTRAINT order_items_course_discount_amount_snapshot_check CHECK (course_discount_amount_snapshot >= 0),
  ADD CONSTRAINT order_items_price_after_course_discount_snapshot_check CHECK (price_after_course_discount_snapshot >= 0),
  ADD CONSTRAINT order_items_combo_discount_amount_snapshot_check CHECK (combo_discount_amount_snapshot >= 0),
  ADD CONSTRAINT order_items_final_price_snapshot_check CHECK (final_price_snapshot >= 0);

UPDATE public.order_items
SET
  list_price_snapshot = price_at_purchase,
  course_discount_amount_snapshot = 0,
  price_after_course_discount_snapshot = price_at_purchase,
  combo_discount_amount_snapshot = 0,
  final_price_snapshot = price_at_purchase
WHERE list_price_snapshot = 0
  AND price_after_course_discount_snapshot = 0
  AND final_price_snapshot = 0;

CREATE TABLE IF NOT EXISTS public.order_discount_lines (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  order_id              uuid        NOT NULL,
  scope                 text        NOT NULL,
  kind                  text        NOT NULL,
  source_id             uuid,
  source_name_snapshot  text        NOT NULL,
  course_id             uuid,
  course_title_snapshot text,
  amount                integer     NOT NULL,
  metadata_json         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT order_discount_lines_pkey PRIMARY KEY (id),
  CONSTRAINT order_discount_lines_scope_check CHECK (scope IN ('course', 'cart')),
  CONSTRAINT order_discount_lines_kind_check CHECK (kind IN ('course_discount', 'combo')),
  CONSTRAINT order_discount_lines_amount_check CHECK (amount > 0),
  CONSTRAINT order_discount_lines_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES public.orders (id) ON DELETE CASCADE,
  CONSTRAINT order_discount_lines_course_id_fkey FOREIGN KEY (course_id)
    REFERENCES public.courses (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_discount_lines_order_id
  ON public.order_discount_lines (order_id);

UPDATE public.orders
SET pricing_snapshot_json = jsonb_build_object(
  'legacy', true,
  'listSubtotal', list_subtotal,
  'courseDiscountTotal', course_discount_amount,
  'comboDiscountTotal', combo_discount_amount,
  'discountTotal', discount_amount,
  'total', total
)
WHERE pricing_snapshot_json IS NULL;

COMMENT ON TABLE public.order_discount_lines IS
  'Immutable snapshot of every course or combo discount applied to an order.';

COMMIT;
