-- Outbox pattern for purchase confirmation emails (US-041)
-- Decouples email sending from webhook processing to avoid blocking the 200 response.
-- Max 5 retries per order; then marked as 'failed' for manual resend from admin.

CREATE TABLE IF NOT EXISTS order_email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL DEFAULT 'purchase_confirmation',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_email_outbox_pending
  ON order_email_outbox (status, next_attempt_at);

-- RLS: only admin and service role can access outbox
ALTER TABLE order_email_outbox ENABLE ROW LEVEL SECURITY;

-- Admin can read all outbox entries
CREATE POLICY "admin_read_order_email_outbox" ON order_email_outbox
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Service role handles all operations (insert, update from cron job)
-- No user-facing policies needed since this is an internal system table.
