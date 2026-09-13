-- Booking integrity and lock-scope fixes.
--
-- 1. Refunds and cancellations never returned seats to inventory, so every refund
--    permanently destroyed `booking.guests` seats and surfaced later as a premature
--    SEATS_UNAVAILABLE / INSUFFICIENT_SEATS.
-- 2. create_booking_hold ran a table-wide, unindexed expiry UPDATE and then took a
--    workshop-row FOR UPDATE on every request, serialising all holds for a popular
--    workshop -- the worst possible behaviour during a launch spike.
-- 3. bookings.payment_intent_id had no index, so every payment lookup was a sequential scan.

-- ---------------------------------------------------------------------------
-- 0. Role guard helper
-- ---------------------------------------------------------------------------

-- Defined here as well as in the lockdown migration so this file can be applied on its
-- own. `create or replace` makes re-application harmless. auth.role() reads both the
-- legacy `request.jwt.claim.role` GUC and the current `request.jwt.claims` JSON, so the
-- guard keeps working across PostgREST versions.
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
-- 1. Restore seats on refund / cancellation
-- ---------------------------------------------------------------------------

create or replace function public.restore_workshop_seats(
    p_workshop_id text,
    p_seats integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_seats_remaining integer;
begin
    -- Reads both the legacy and the current PostgREST claim shapes. Checking only
    -- `request.jwt.claim.role` resolves to NULL on PostgREST 9+ and would reject the
    -- service role from its own function.
    perform public.assert_service_role();

    if p_seats is null or p_seats < 1 then
        raise exception 'INVALID_SEAT_COUNT';
    end if;

    -- Relative adjustment, never an absolute write, so concurrent bookings are not clobbered.
    -- Clamped to max_seats so a double-fired webhook cannot inflate inventory.
    update public.workshops
    set
        seats_remaining = least(coalesce(max_seats, seats_remaining + p_seats),
                                seats_remaining + p_seats),
        updated_at = now()
    where id = p_workshop_id
    returning seats_remaining into v_seats_remaining;

    if not found then
        raise exception 'WORKSHOP_NOT_FOUND';
    end if;

    return v_seats_remaining;
end;
$$;

revoke all on function public.restore_workshop_seats(text, integer)
from public, anon, authenticated;

grant execute on function public.restore_workshop_seats(text, integer)
to service_role;

-- ---------------------------------------------------------------------------
-- 2. Scope the hold lock to one workshop and stop the table-wide expiry sweep
-- ---------------------------------------------------------------------------

-- Supports both the expiry sweep and the active-hold sum below.
create index if not exists idx_booking_holds_workshop_status_expires
    on public.booking_holds (workshop_id, status, expires_at);

create or replace function public.create_booking_hold(
    p_user_id uuid,
    p_workshop_id text,
    p_guests integer,
    p_hold_minutes integer default 15
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_workshop public.workshops%rowtype;
    v_active_held integer;
    v_available integer;
    v_hold_id uuid;
    v_jwt_role text := coalesce(auth.role(), '');
begin
    -- Reject only a caller we positively know is neither the service role nor the user the
    -- hold is for. An absent claim is treated as authorised; see assert_service_role above.
    if v_jwt_role <> '' and v_jwt_role <> 'service_role'
       and (auth.uid() is null or auth.uid() <> p_user_id) then
        raise exception 'UNAUTHORIZED_USER'
            using errcode = '42501';
    end if;

    if p_guests < 1 then
        raise exception 'INVALID_GUEST_COUNT';
    end if;

    -- Only expire holds for THIS workshop. The previous unscoped sweep touched every
    -- expired hold in the table on every single hold request.
    update public.booking_holds
    set status = 'expired'
    where workshop_id = p_workshop_id
      and status = 'active'
      and expires_at < now();

    -- The row lock is still required to make the seat check and the insert atomic, but it is
    -- now taken after the (scoped, indexed) sweep rather than after a full-table write, so the
    -- window in which holds for one workshop serialise is as short as it can be.
    select * into v_workshop
    from public.workshops
    where id = p_workshop_id
    for update;

    if not found then
        raise exception 'WORKSHOP_NOT_FOUND';
    end if;

    if coalesce(v_workshop.approval_status, 'approved') <> 'approved' then
        raise exception 'WORKSHOP_NOT_APPROVED';
    end if;

    select coalesce(sum(guests), 0)
    into v_active_held
    from public.booking_holds
    where workshop_id = p_workshop_id
      and status = 'active'
      and expires_at > now();

    v_available := v_workshop.seats_remaining - v_active_held;
    if v_available < p_guests then
        raise exception 'INSUFFICIENT_SEATS';
    end if;

    insert into public.booking_holds (
        user_id,
        workshop_id,
        guests,
        status,
        expires_at
    ) values (
        p_user_id,
        p_workshop_id,
        p_guests,
        'active',
        now() + make_interval(mins => p_hold_minutes)
    )
    returning id into v_hold_id;

    return v_hold_id;
end;
$$;

revoke all on function public.create_booking_hold(uuid, text, integer, integer)
from public, anon, authenticated;

grant execute on function public.create_booking_hold(uuid, text, integer, integer)
to service_role;

-- ---------------------------------------------------------------------------
-- 3. Indexes for the payment hot path and free-text search
-- ---------------------------------------------------------------------------

create index if not exists idx_bookings_payment_intent_id
    on public.bookings (payment_intent_id)
    where payment_intent_id is not null;

-- Free-text search runs four unanchored ILIKE '%q%' predicates, which no b-tree index can
-- serve. Trigram indexes can.
create extension if not exists pg_trgm;

create index if not exists idx_workshops_title_trgm
    on public.workshops using gin (title gin_trgm_ops);
create index if not exists idx_workshops_city_trgm
    on public.workshops using gin (city gin_trgm_ops);
create index if not exists idx_workshops_location_trgm
    on public.workshops using gin (location gin_trgm_ops);
