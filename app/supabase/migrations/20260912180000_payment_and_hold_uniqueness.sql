-- Database-level guards for the two booking races the application layer cannot close on
-- its own.
--
-- 1. One captured payment must produce at most one booking. The application re-checks by
--    payment_intent_id before and after confirming, but two requests can pass that check in
--    the same instant; only a unique index actually decides.
-- 2. One user must hold seats for a given workshop at most once. The route "releases my own
--    active holds, then creates a new one" in two separate statements, so two tabs both
--    release and both insert -- one user can pin an unbounded number of seats.
--
-- DEPLOY ORDER: apply this BEFORE rolling out the matching application change. The route no
-- longer releases the caller's superseded hold itself; create_booking_hold below does. An app
-- deployed against the old function would stop releasing entirely, and a user who went back
-- and retried would be blocked by their own stale hold until it expired.
--
-- APPLY WHEN TRAFFIC IS LOW. The dedup below releases duplicate active holds, and a hold that
-- is released while its owner is on the Razorpay screen becomes HOLD_NOT_ACTIVE at confirm
-- time -- which the checkout route answers with an automatic refund. The money comes back,
-- but the booking does not happen.

-- The lock, the pre-flight checks, the dedup and both index builds run as one unit inside
-- this DO block.
--
-- It cannot be a bare `lock table` at file scope: Supabase applies each statement of a
-- migration on its own, NOT inside a wrapping transaction, so that raises
--   ERROR: LOCK TABLE can only be used in transaction blocks (SQLSTATE 25P01)
-- and the migration dies before it starts. A DO body always runs inside a transaction, and the
-- lock is held until that body ends -- which is why everything the lock protects has to live
-- in here with it rather than following it at file scope.
--
-- Why lock at all: without it a request served by the still-running old code can insert a
-- conflicting row between the dedup and the index build, and the migration dies on a raw 23505
-- instead of its own diagnostics. SHARE ROW EXCLUSIVE blocks writers while leaving plain
-- SELECTs alone, and is compatible with the SHARE that CREATE INDEX takes.
do $$
declare
    v_duplicates text;
begin
    lock table public.bookings, public.booking_holds in share row exclusive mode;

    -- -----------------------------------------------------------------------
    -- 1. At most one booking per payment
    -- -----------------------------------------------------------------------

    -- A duplicate here means real money was turned into two bookings and needs a human, not
    -- an automatic merge. Fail with the offending ids rather than the index generic message,
    -- so whoever runs this knows exactly what to reconcile.
    select string_agg(payment_intent_id, ', ')
    into v_duplicates
    from (
        select payment_intent_id
        from public.bookings
        where payment_intent_id is not null
        group by payment_intent_id
        having count(*) > 1
        limit 20
    ) as dupes;

    if v_duplicates is not null then
        raise exception
            'Cannot add unique index: bookings already share a payment_intent_id (%). Reconcile these payments before applying this migration.',
            v_duplicates;
    end if;

    -- The existing idx_bookings_payment_intent_id is a plain lookup index and enforces nothing.
    execute 'create unique index if not exists idx_bookings_payment_intent_id_unique
        on public.bookings (payment_intent_id)
        where payment_intent_id is not null';

    -- -----------------------------------------------------------------------
    -- 2. At most one ACTIVE hold per user per workshop
    -- -----------------------------------------------------------------------

    -- Unlike the payment duplicates above, extra active holds are expected -- they are exactly
    -- the bug being fixed -- and they are disposable: a hold is a 15-minute reservation, not a
    -- record of anything that happened. Collapse each (user, workshop) group down to its newest
    -- hold, which is what the route was already trying to do non-atomically.
    --
    -- `newer` is read under this statement snapshot, so rows this UPDATE is releasing still
    -- count as active while it runs. Exactly one row per group -- the maximum of
    -- (created_at, id) -- therefore has no strictly greater peer and survives. The id breaks
    -- ties on created_at, so the survivor is always unique.
    update public.booking_holds as stale
    set status = 'released'
    where status = 'active'
      and exists (
          select 1
          from public.booking_holds as newer
          where newer.user_id = stale.user_id
            and newer.workshop_id = stale.workshop_id
            and newer.status = 'active'
            and (newer.created_at, newer.id) > (stale.created_at, stale.id)
      );

    execute 'create unique index if not exists idx_booking_holds_one_active_per_user_workshop
        on public.booking_holds (user_id, workshop_id)
        where status = ''active''';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Fold the self-release into create_booking_hold
-- ---------------------------------------------------------------------------

-- With the index above in place, "release my old hold" and "insert my new hold" can no
-- longer be two statements from two connections: the second insert would simply raise. Doing
-- the release inside the same transaction as the seat check makes the whole hold atomic, and
-- keeps the seat arithmetic correct -- the caller's own superseded hold must not count
-- against the seats they are about to reserve.
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
    -- hold is for. An absent claim is treated as authorised; see assert_service_role.
    if v_jwt_role <> '' and v_jwt_role <> 'service_role'
       and (auth.uid() is null or auth.uid() <> p_user_id) then
        raise exception 'UNAUTHORIZED_USER'
            using errcode = '42501';
    end if;

    if p_guests < 1 then
        raise exception 'INVALID_GUEST_COUNT';
    end if;

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
        -- The count rides along in the message. Without it the API can say "not enough
        -- seats" but not "only 2 left", because the non-atomic fallback that used to compute
        -- that number is refused in production -- so the workshop page silently lost its
        -- seat-count correction exactly where it matters.
        raise exception 'INSUFFICIENT_SEATS:%', greatest(v_available, 0);
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
