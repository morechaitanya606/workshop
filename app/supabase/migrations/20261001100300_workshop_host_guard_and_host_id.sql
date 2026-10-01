-- Workshops: stop hosts self-approving / self-pricing, and give every workshop its host_id.
--
-- A. HOST WRITE GUARD. workshops_insert_admin_or_host_own / workshops_update_admin_or_host_own
--    (20260310104615) let a user with role 'host' write their own rows with no column limit.
--    Through PostgREST with their own JWT a host could therefore:
--      * insert a workshop that is immediately live (approval_status defaults to 'approved'),
--      * flip approval_status from 'rejected'/'pending' to 'approved',
--      * change price / max_seats / seats_remaining after people booked,
--      * forge rating / review_count.
--    The application never does this: every host and admin workshop write goes through the
--    service role (api/host/workshops, api/admin/workshops), which is exempt below. So the
--    policies stay as they are (they still scope WHICH rows) and a trigger limits WHAT can be
--    written.
--
--    The column DEFAULT of approval_status stays 'approved' on purpose: admin-created
--    workshops, seed scripts and the legacy fallback insert (withoutApprovalStatus) rely on
--    it. Hosts get 'pending' because the trigger forces it for them.
--
-- B. host_id. Workshops created through the API only ever got host_user_id, never host_id,
--    so `if (!booking.workshop?.host_id) continue` in the Razorpay webhook silently skipped
--    the host's earnings. host_id is now derived from hosts.user_id = workshops.host_user_id.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- ---------------------------------------------------------------------------
-- A. Host write guard
-- ---------------------------------------------------------------------------

-- Exempt: service_role, admins, callers with no JWT role (migrations / SQL editor), and nested
-- trigger writes (pg_trigger_depth() > 1) -- the rating rollup and the hosts -> workshops
-- host_id backfill below are SECURITY DEFINER trigger writes that run under the end user's
-- claims and must not be blocked.
create or replace function private.guard_workshop_host_writes()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
    v_role text := coalesce(auth.role(), '');
begin
    if v_role = ''
       or v_role = 'service_role'
       or pg_trigger_depth() > 1
       or public.user_has_role('admin') then
        return new;
    end if;

    if tg_op = 'INSERT' then
        new.approval_status := 'pending';
        new.seats_remaining := new.max_seats;
        new.rating := 0;
        new.review_count := 0;
        new.host_id := null; -- re-derived from host_user_id by sync_workshop_host_id
        return new;
    end if;

    if new.approval_status is distinct from old.approval_status
       or new.price is distinct from old.price
       or new.seats_remaining is distinct from old.seats_remaining
       or new.max_seats is distinct from old.max_seats
       or new.rating is distinct from old.rating
       or new.review_count is distinct from old.review_count
       or new.host_id is distinct from old.host_id
       or new.created_by is distinct from old.created_by then
        raise exception 'WORKSHOP_RESTRICTED_COLUMNS'
            using errcode = '42501',
                  hint = 'approval_status, price, seats, rating and ownership can only be changed by an admin or the server.';
    end if;

    return new;
end;
$$;

revoke all on function private.guard_workshop_host_writes() from public, anon, authenticated;

drop trigger if exists guard_workshop_host_writes on public.workshops;
create trigger guard_workshop_host_writes
before insert or update on public.workshops
for each row execute function private.guard_workshop_host_writes();

-- ---------------------------------------------------------------------------
-- B. host_id derivation
-- ---------------------------------------------------------------------------

-- Fills host_id from host_user_id when it is missing, and re-derives it when the owner
-- changes (the old host row no longer applies). SECURITY DEFINER only so the lookup does not
-- depend on the caller's RLS; hosts is publicly readable anyway.
-- Named so it sorts AFTER guard_workshop_host_writes: the guard sees what the caller wrote,
-- then this fills in the derived column.
create or replace function private.sync_workshop_host_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.host_user_id is null then
        return new;
    end if;

    if tg_op = 'UPDATE'
       and new.host_user_id is distinct from old.host_user_id
       and new.host_id is not distinct from old.host_id then
        new.host_id := null;
    end if;

    if new.host_id is null then
        select h.id
        into new.host_id
        from public.hosts as h
        where h.user_id = new.host_user_id
        limit 1;
    end if;

    return new;
end;
$$;

revoke all on function private.sync_workshop_host_id() from public, anon, authenticated;

drop trigger if exists sync_workshop_host_id on public.workshops;
create trigger sync_workshop_host_id
before insert or update on public.workshops
for each row execute function private.sync_workshop_host_id();

-- A hosts row is created when the application is approved, which can be after the person's
-- first workshop. Link any workshops that were waiting for it.
create or replace function private.backfill_workshops_host_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.user_id is not null then
        update public.workshops
        set host_id = new.id
        where host_user_id = new.user_id
          and host_id is null;
    end if;
    return null;
end;
$$;

revoke all on function private.backfill_workshops_host_id() from public, anon, authenticated;

drop trigger if exists backfill_workshops_host_id on public.hosts;
create trigger backfill_workshops_host_id
after insert or update of user_id on public.hosts
for each row execute function private.backfill_workshops_host_id();

-- One-off backfill of existing workshops. hosts.user_id is unique (idx_hosts_user_id_unique),
-- so the join is one-to-one. This bumps workshops.updated_at on the touched rows
-- (set_workshops_updated_at) and does NOT back-fill host_earnings for bookings that were
-- already paid out of band: that needs the fee maths in the webhook and is an application
-- task.
update public.workshops as w
set host_id = h.id
from public.hosts as h
where h.user_id = w.host_user_id
  and w.host_id is null;
