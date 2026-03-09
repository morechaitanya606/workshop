-- Migration: 20260310_email_delivery_logs.sql
-- Description: Creates a table to log outgoing emails for tracking and retries.

CREATE TYPE email_delivery_status AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    template_name TEXT NOT NULL,
    status email_delivery_status NOT NULL DEFAULT 'pending',
    error_message TEXT,
    reference_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    sent_at TIMESTAMPTZ
);

COMMENT ON TABLE public.email_delivery_logs IS 'Tracks outgoing transactional emails.';
COMMENT ON COLUMN public.email_delivery_logs.template_name IS 'The React Email template identifier used.';
COMMENT ON COLUMN public.email_delivery_logs.error_message IS 'Populated if the Resend API returns an error.';
COMMENT ON COLUMN public.email_delivery_logs.reference_id IS 'Optional reference ID (e.g., booking_id) for deduplication.';

-- RLS: Service role only
ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can manage email logs. No policies needed for public/authenticated users.
