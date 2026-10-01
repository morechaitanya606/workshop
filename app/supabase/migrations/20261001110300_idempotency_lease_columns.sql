-- Leased idempotency claims.
--
-- payment_webhook_events doubles as the durable idempotency store. A claim was written
-- BEFORE the work and never revisited, so a lambda that was killed or timed out mid-event
-- burned it: Razorpay's retry hit the unique key and was ACKed as a duplicate, and the
-- payment was never recorded.
--
-- src/lib/idempotency.ts now treats a claim as a lease: `processed_at` stays null while the
-- work is in flight, is set when it succeeds, and a lease older than its window may be taken
-- over by a retry. That needs both timestamp columns to exist, so assert them here (the
-- table was created by two different migrations with different column sets).

alter table public.payment_webhook_events
    add column if not exists received_at timestamptz not null default now(),
    add column if not exists processed_at timestamptz;

-- Every claim that exists today predates leases. Mark it processed so enabling lease
-- takeover cannot make an old, finished event re-claimable.
update public.payment_webhook_events
set processed_at = received_at
where processed_at is null;
