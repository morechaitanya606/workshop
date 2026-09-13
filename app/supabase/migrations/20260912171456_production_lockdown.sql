-- Production lockdown.
--
-- The booking RPCs shipped as SECURITY DEFINER with PostgREST's default EXECUTE grant
-- still in place, so `anon` could POST /rest/v1/rpc/confirm_booking_from_hold with the
-- publishable key lifted from the page source and mint a confirmed booking without
-- paying. SECURITY DEFINER bypasses RLS, so nothing else stood in the way.
--
-- The revokes existed only in migrations that were never applied to the live database.
-- This file is idempotent and re-asserts them across every overload, so a later
-- CREATE OR REPLACE cannot silently restore the grant.

-- ---------------------------------------------------------------------------
-- 1. Revoke EXECUTE on every money-touching routine, for every overload
-- ---------------------------------------------------------------------------

do $$
declare
    fn record;
begin
    for fn in
        select p.oid::regprocedure as signature
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (
              'create_booking_hold',
              'confirm_booking_from_hold',
              'restore_workshop_seats',
              'decrement_seats',
              'increment_coupon_usage'
          )
    loop
        execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
        execute format('grant execute on function %s to service_role', fn.signature);
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Coupon codes are bearer secrets, not public data
-- ---------------------------------------------------------------------------

-- The live policy exposed every active coupon's code, value and remaining uses to any
-- caller holding the publishable key. Validation runs server-side under the service role
-- in /api/coupons/validate, and every other reader is an admin route that also uses the
-- service client, so no browser client needs SELECT here.
--
-- Belt and braces: policies are inert if RLS is off, so never assume it is on.
alter table if exists public.coupons enable row level security;

-- Dropped by iteration rather than by name. The policy actually deployed is called
-- "Public can read active coupons"; the repo's migration history assumed
-- `coupons_select_active_or_admin`, so a name-based DROP silently no-ops and leaves the
-- table readable. Anything that has drifted in gets removed here too.
do $$
declare
    p record;
begin
    for p in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = 'coupons'
    loop
        execute format('drop policy if exists %I on public.coupons', p.policyname);
    end loop;
end;
$$;

-- Note: the dropped policies gated writes on profiles.role = 'superadmin', which matches
-- no rows in this database (roles in use are user/host/admin). user_has_role('admin') is
-- the model the application actually uses.
-- A single FOR ALL policy: its USING clause already governs SELECT, so a separate
-- admin-only SELECT policy would just be a second permissive policy evaluated on every
-- read without adding any restriction.
create policy coupons_admin_manage
on public.coupons
for all
using (public.user_has_role('admin'))
with check (public.user_has_role('admin'));

-- ---------------------------------------------------------------------------
-- 3. A role check that works on current PostgREST
-- ---------------------------------------------------------------------------

-- `request.jwt.claim.role` is the pre-PostgREST-9 GUC. Current PostgREST sets
-- `request.jwt.claims` (JSON) instead; Supabase's auth.role() reads both spellings.
-- Guards that read only the legacy name resolve to NULL and lock us out of our own
-- functions, which would send every hold down the non-atomic fallback path.
-- EXECUTE on these routines is granted to service_role only, so reaching them already
-- implies an authorised caller; this check is defence in depth against a future re-grant.
-- It therefore rejects only a claim that is PRESENT and explicitly not service_role.
-- auth.role() reads request.jwt.claims, and a SECURITY DEFINER body cannot fall back to
-- current_user (that resolves to the function owner, not the caller), so a fail-closed
-- guard would raise on every hold and refund if a future API key format stopped
-- populating that GUC -- taking checkout down. Fail open on an absent claim instead.
create or replace function public.assert_service_role()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if coalesce(auth.role(), 'service_role') <> 'service_role' then
        raise exception 'UNAUTHORIZED_ROLE' using errcode = '42501';
    end if;
end;
$$;

revoke all on function public.assert_service_role() from public, anon, authenticated;
grant execute on function public.assert_service_role() to service_role;

-- ---------------------------------------------------------------------------
-- 4. Pin search_path on the functions the database linter flagged
-- ---------------------------------------------------------------------------

do $$
declare
    fn record;
begin
    for fn in
        select p.oid::regprocedure as signature
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('increment_coupon_usage', 'decrement_seats', 'set_updated_at')
    loop
        execute format('alter function %s set search_path = public', fn.signature);
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Aggregate admin stats in the database
-- ---------------------------------------------------------------------------

-- /api/admin/stats pulled every workshop id, then every confirmed booking for those ids,
-- and summed them in JavaScript. PostgREST caps rows (1000 by default), so revenue was
-- silently truncated and under-reported, and once the id list grew the `in(...)` filter
-- pushed the request URL past the 414 limit. Aggregate where the rows already live.
create or replace function public.admin_dashboard_stats(p_reset_at timestamptz)
returns table (
    active_workshops integer,
    total_booked_seats integer,
    revenue numeric,
    avg_rating numeric
)
language sql
stable
security definer
set search_path = public
as $$
    with scoped_workshops as (
        select id from public.workshops where created_at >= p_reset_at
    )
    select
        (select count(*)::integer from scoped_workshops),
        coalesce((
            select sum(b.guests)::integer
            from public.bookings b
            join scoped_workshops w on w.id = b.workshop_id
            where b.status = 'confirmed'
        ), 0),
        coalesce((
            select sum(b.total)::numeric
            from public.bookings b
            join scoped_workshops w on w.id = b.workshop_id
            where b.status = 'confirmed'
        ), 0),
        (
            select round(avg(f.rating)::numeric, 1)
            from public.workshop_feedback f
            join scoped_workshops w on w.id = f.workshop_id
            where f.rating is not null
        );
$$;

revoke all on function public.admin_dashboard_stats(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_dashboard_stats(timestamptz) to service_role;

-- Supports the scoped_workshops scan above.
create index if not exists idx_workshops_created_at on public.workshops (created_at);
create index if not exists idx_bookings_workshop_status on public.bookings (workshop_id, status);
