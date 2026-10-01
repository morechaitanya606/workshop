-- Indexes.
--
-- A. email_delivery_logs had no indexes at all. The cron job scans it by (template_name,
--    status, created_at) every run and sendEmailAndLog / the confirmation retry look rows up by
--    reference_id; both were sequential scans of an append-only table.
-- B. At most one 'sent' row per (template, reference): a hard dedupe guard under the
--    in-memory/DB idempotency claim.
-- C. Drop indexes that a wider existing index already serves (same leading columns), so
--    every insert maintains fewer b-trees. Only clear prefix/duplicate cases.

-- ---------------------------------------------------------------------------
-- A. Lookup indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_email_delivery_logs_template_status_created
    on public.email_delivery_logs (template_name, status, created_at desc);

create index if not exists idx_email_delivery_logs_reference_id
    on public.email_delivery_logs (reference_id)
    where reference_id is not null;

-- ---------------------------------------------------------------------------
-- B. One 'sent' row per (template, reference)
-- ---------------------------------------------------------------------------

-- Rows are not deleted (they are the delivery audit trail). A second 'sent' row for the same
-- template and reference means the email went out twice; the later ones are re-labelled
-- 'failed' with an explanatory error_message so exactly one 'sent' row remains per pair.
-- Nothing reads 'failed' rows when a 'sent' row exists for the same booking (the cron retry
-- only counts failures for bookings with no 'sent' row), so this does not trigger a resend.
update public.email_delivery_logs as l
set status = 'failed',
    error_message = coalesce(l.error_message || ' | ', '')
        || 'superseded duplicate of an earlier sent row (relabelled by migration 20261001100700)'
from (
    select id,
           row_number() over (
               partition by template_name, reference_id
               order by coalesce(sent_at, created_at) asc, id
           ) as rn
    from public.email_delivery_logs
    where status = 'sent'
      and reference_id is not null
) as d
where l.id = d.id
  and d.rn > 1;

-- After this, the 'pending' -> 'sent' UPDATE in sendEmailAndLog fails with 23505 for a
-- concurrent duplicate send. The code ignores that error, so the extra row simply stays
-- 'pending'; that is the guard doing its job.
create unique index if not exists uq_email_delivery_logs_sent_once
    on public.email_delivery_logs (template_name, reference_id)
    where status = 'sent' and reference_id is not null;

-- ---------------------------------------------------------------------------
-- C. Redundant indexes
-- ---------------------------------------------------------------------------

-- slug is UNIQUE, which already has an index.
drop index if exists public.idx_communities_slug;

-- Covered by unique (user_id, workshop_id) on these tables (user_id is the leading column).
drop index if exists public.idx_workshop_feedback_user_id;
drop index if exists public.idx_workshop_notification_preferences_user_id;
drop index if exists public.idx_user_favorites_user;

-- Covered by idx_workshop_feedback_workshop_published (workshop_id, is_published, created_at).
drop index if exists public.idx_workshop_feedback_workshop_id;

-- Covered by idx_bookings_user_created_at (user_id, created_at desc).
drop index if exists public.idx_bookings_user_id;

-- Covered by idx_workshops_city_date_category (city, date, category).
drop index if exists public.idx_workshops_city;

-- Covered by idx_booking_holds_workshop_status_expires (workshop_id, status, expires_at).
drop index if exists public.idx_booking_holds_workshop_id;

-- Covered by the unique indexes created in the earlier migrations of this series; guarded so a
-- run that skipped them cannot leave the foreign key unindexed.
do $$
begin
    if exists (
        select 1 from pg_indexes
        where schemaname = 'public' and indexname = 'uq_waitlists_workshop_email'
    ) then
        drop index if exists public.idx_waitlists_workshop;
    end if;

    if exists (
        select 1 from pg_indexes
        where schemaname = 'public' and indexname = 'uq_coupon_redemptions_booking_id'
    ) then
        drop index if exists public.idx_coupon_redemptions_booking_id;
    end if;
end;
$$;
