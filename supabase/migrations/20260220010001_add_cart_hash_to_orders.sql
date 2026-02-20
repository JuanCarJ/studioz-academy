-- H-01: Add cart_hash column for content-based idempotency
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cart_hash text;

COMMENT ON COLUMN public.orders.cart_hash IS 'SHA-256 hash of sorted(course_id:price) for content-based checkout idempotency';
