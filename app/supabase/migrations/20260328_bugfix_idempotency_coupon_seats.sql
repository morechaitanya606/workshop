-- Migration: Bug fixes for idempotency, coupon tracking, and seat management
-- BUG-3: Create durable idempotency table for webhook dedup
-- BUG-1: Create atomic coupon usage increment function
-- BUG-4: Create atomic seat decrement function

-- ============================================================
-- 1. payment_webhook_events — durable idempotency store
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    provider text NOT NULL DEFAULT 'idempotency',
    event_key text NOT NULL,
    event_type text NOT NULL DEFAULT 'idempotency_claim',
    payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Unique constraint used by the idempotency layer to atomically detect duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_webhook_events_event_key
    ON payment_webhook_events (event_key);

-- RLS: Only service role should access this table
ALTER TABLE payment_webhook_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. increment_coupon_usage — atomic coupon used_count bump
-- ============================================================
CREATE OR REPLACE FUNCTION increment_coupon_usage(p_coupon_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE coupons
    SET used_count = COALESCE(used_count, 0) + 1
    WHERE id = p_coupon_id;
END;
$$;

-- ============================================================
-- 3. decrement_seats — atomic seat decrement with guard
-- ============================================================
CREATE OR REPLACE FUNCTION decrement_seats(p_workshop_id uuid, p_count int)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    UPDATE workshops
    SET seats_remaining = seats_remaining - p_count
    WHERE workshops.id = p_workshop_id
      AND seats_remaining >= p_count
    RETURNING workshops.id;
END;
$$;
