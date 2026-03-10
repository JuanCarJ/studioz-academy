ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS discount_rule_name_snapshot text;

COMMENT ON COLUMN public.orders.discount_rule_name_snapshot IS
  'Historical snapshot of the applied discount rule name at order creation time';

UPDATE public.orders AS o
SET discount_rule_name_snapshot = dr.name
FROM public.discount_rules AS dr
WHERE o.discount_rule_name_snapshot IS NULL
  AND o.discount_rule_id = dr.id;
