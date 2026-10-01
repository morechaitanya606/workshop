-- Seat-hold griefing caps.
--
-- A hold pins seats for 8 minutes (the app's BOOKING_HOLD_MINUTES) without any payment, and
-- nothing bounded it:
--   * one user could hold seats on every workshop at once, and
--   * re-holding released the previous hold and issued a fresh window, so one user could
--     keep the same seats off sale indefinitely by re-clicking "reserve" every few minutes.
--
-- This replaces create_booking_hold (latest body: 20260912180000_payment_and_hold_uniqueness)
-- with the same logic plus two limits:
--   1. total seats a user holds across ALL workshops while active is capped (20);
--   2. a re-hold inherits the original start of the hold it supersedes, and no chain of
--      re-holds may keep seats for longer than 30 minutes in total. Once the chain is
--      exhausted the request is refused; the old hold is left to expire normally.
-- Both limits roll back with the exception, like every other rejection in this function.
--
-- The route maps HOLD_LIMIT_EXCEEDED and HOLD_TIME_LIMIT_REACHED to a 429.

alter table public.booking_holds
    add column if not exists hold_started_at timestamptz;

create or replace function public.create_booking_hold(
    p_user_id uuid,
    p_workshop_id text,
    p_guests integer,
    p_hold_minutes integer default 8
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    c_max_user_held_seats constant integer := 20;
    c_max_chain interval := make_interval(mins => 30);
    c_min_remaining interval := make_interval(mins => 2);
    v_workshop public.workshops%rowtype;
    v_active_held integer;
    v_user_held_elsewhere integer;
    v_available integer;
    v_hold_id uuid;
    v_chain_started timestamptz;
    v_started timestamptz;
    v_expires timestamptz;
    v_jwt_role text := coalesce(auth.role(), '');
begin
    -- Reject only a caller we positively know is neither the service role nor the user the
    -- hold is for. An absent claim is treated as authorised; see assert_service_role.
    if v_jwt_role <> '' and v_jwt_role <> 'service_role'
       and (auth.uid() is null or auth.uid() <> p_user_id) then
        raise exception 'UNAUTHORIZED_USER'
            using errcode = '42501';
    end if;

    if p_guests < 1 then
        raise exception 'INVALID_GUEST_COUNT';
    end if;

    -- Serialises one user's concurrent holds so the per-user cap cannot be raced past by
    -- two tabs. Always taken first, and only ever alone-before-anything-else, so it cannot
    -- take part in a lock cycle.
    perform pg_advisory_xact_lock(hashtextextended('booking_hold:' || p_user_id::text, 0));

    -- LOCK ORDER: every booking_holds write happens BEFORE the workshops row lock below.
    -- confirm_booking_from_hold takes its hold row FOR UPDATE and only then locks the
    -- workshop, so acquiring them the other way round here would deadlock a confirm against
    -- a concurrent hold for the same workshop -- and a deadlock during confirm lands after
    -- the card has been captured, where the route's only answer is to refund. Do not
    -- reorder these blocks.

    -- Only expire holds for THIS workshop. An unscoped sweep touches every expired hold in
    -- the table on every single hold request.
    update public.booking_holds
    set status = 'expired'
    where workshop_id = p_workshop_id
      and status = 'active'
      and expires_at < now();

    -- The caller's own live hold, if any: its original start is what a re-hold inherits.
    -- Expired holds were flipped above, so a user who comes back after letting one lapse
    -- starts a new chain -- the seats were genuinely back on sale in between.
    select coalesce(h.hold_started_at, h.created_at)
    into v_chain_started
    from public.booking_holds as h
    where h.user_id = p_user_id
      and h.workshop_id = p_workshop_id
      and h.status = 'active'
    limit 1;

    v_started := coalesce(v_chain_started, now());

    if v_started + c_max_chain - now() < c_min_remaining then
        raise exception 'HOLD_TIME_LIMIT_REACHED';
    end if;

    v_expires := least(now() + make_interval(mins => p_hold_minutes), v_started + c_max_chain);

    -- Release the caller's own superseded hold, so a user who goes back and retries cannot
    -- lock themselves out and cannot stack reservations. It rolls back with any exception
    -- raised below, so a rejected request leaves the caller exactly as it found them --
    -- unlike the route-level release this replaces, which committed on its own and destroyed
    -- a valid hold whenever the seat check then failed.
    update public.booking_holds
    set status = 'released'
    where user_id = p_user_id
      and workshop_id = p_workshop_id
      and status = 'active';

    -- Seats this user already pins on OTHER workshops (this workshop's own hold was just
    -- released above, so it is correctly not counted against itself).
    select coalesce(sum(h.guests), 0)
    into v_user_held_elsewhere
    from public.booking_holds as h
    where h.user_id = p_user_id
      and h.workshop_id <> p_workshop_id
      and h.status = 'active'
      and h.expires_at > now();

    if v_user_held_elsewhere + p_guests > c_max_user_held_seats then
        raise exception 'HOLD_LIMIT_EXCEEDED:%',
            greatest(c_max_user_held_seats - v_user_held_elsewhere, 0);
    end if;

    -- The row lock makes the seat check and the insert atomic. It is taken after the
    -- (scoped, indexed) writes above rather than after a full-table write, so the window in
    -- which holds for one workshop serialise is as short as it can be.
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

    -- Runs after the release above, so the caller's own superseded hold is not counted
    -- against the seats they are about to reserve.
    select coalesce(sum(guests), 0)
    into v_active_held
    from public.booking_holds
    where workshop_id = p_workshop_id
      and status = 'active'
      and expires_at > now();

    v_available := v_workshop.seats_remaining - v_active_held;
    if v_available < p_guests then
        -- The count rides along in the message so the API can say "only 2 left".
        raise exception 'INSUFFICIENT_SEATS:%', greatest(v_available, 0);
    end if;

    insert into public.booking_holds (
        user_id,
        workshop_id,
        guests,
        status,
        expires_at,
        hold_started_at
    ) values (
        p_user_id,
        p_workshop_id,
        p_guests,
        'active',
        v_expires,
        v_started
    )
    returning id into v_hold_id;

    return v_hold_id;
end;
$$;

revoke all on function public.create_booking_hold(uuid, text, integer, integer)
from public, anon, authenticated;

grant execute on function public.create_booking_hold(uuid, text, integer, integer)
to service_role;
