-- Retention for payment_webhook_events.
--
-- The table is two things at once:
--   provider = 'idempotency'  durable dedup/lease claims (src/lib/idempotency.ts). One row per
--                             email, notification and webhook ever handled; never deleted, so
--                             it grows forever and every claim is a unique-index probe on it.
--   provider = 'onlyworkshop' stored copies of outgoing payment notifications
--                             (api/internal/payments/events). The payload carries the
--                             customer's name, email and phone (data.booking.customer) -- PII
--                             kept indefinitely for no purpose.
--
-- purge_old_webhook_events() is meant to be called on a schedule (daily is plenty) by the
-- service role, e.g. from a cron route: supabase.rpc('purge_old_webhook_events').
--
--  * idempotency rows older than p_retain_days are DELETED. A claim only has to outlive the
--    provider's retry window (Razorpay retries for ~24 h; the longest in-app TTL is days), so
--    30 days is far past any replay. Unprocessed leases (processed_at is null) are dropped by
--    the same rule: a lease that old was abandoned long ago.
--  * onlyworkshop rows older than p_retain_days are KEPT as an audit row but have the customer
--    identity stripped: data.booking.customer, data.customer and the common flat keys are
--    removed and a pii_redacted_at marker is added so each row is rewritten only once.
--
-- Idempotent and safe to run concurrently with itself (each statement only touches rows that
-- still qualify).

-- Asserted here as well as in 20261001110300_idempotency_lease_columns.sql: the table was
-- created by two different migrations with different column sets, and this function needs it.
alter table public.payment_webhook_events
    add column if not exists received_at timestamptz not null default now();

create index if not exists idx_payment_webhook_events_provider_received
    on public.payment_webhook_events (provider, received_at);

create or replace function public.purge_old_webhook_events(p_retain_days integer default 30)
returns table (
    idempotency_deleted integer,
    payloads_redacted integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cutoff timestamptz;
    v_deleted integer := 0;
    v_redacted integer := 0;
begin
    if p_retain_days is null or p_retain_days < 1 then
        raise exception 'INVALID_RETENTION_DAYS' using errcode = '22023';
    end if;

    v_cutoff := now() - make_interval(days => p_retain_days);

    delete from public.payment_webhook_events
    where provider = 'idempotency'
      and received_at < v_cutoff;
    get diagnostics v_deleted = row_count;

    update public.payment_webhook_events
    set payload = (
            payload
                #- '{data,booking,customer}'
                #- '{data,customer}'
                #- '{data,email}'
                #- '{data,phone}'
                #- '{data,booking,email}'
                #- '{data,booking,phone}'
                #- '{data,booking,first_name}'
                #- '{data,booking,last_name}'
        ) || jsonb_build_object('pii_redacted_at', now())
    where provider = 'onlyworkshop'
      and received_at < v_cutoff
      and jsonb_typeof(payload) = 'object'
      and (payload -> 'pii_redacted_at') is null;
    get diagnostics v_redacted = row_count;

    return query select v_deleted, v_redacted;
end;
$$;

revoke all on function public.purge_old_webhook_events(integer) from public, anon, authenticated;
grant execute on function public.purge_old_webhook_events(integer) to service_role;
