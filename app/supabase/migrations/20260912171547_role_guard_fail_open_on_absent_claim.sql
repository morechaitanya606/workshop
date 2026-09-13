-- Recovered from supabase_migrations.schema_migrations on the linked project.
--
-- This migration was applied directly to the database and its SQL never existed in the
-- repository, so the repo could not reproduce production. The body below is exactly what
-- the history table recorded as executed; it is checked in unchanged so the migration set
-- is complete. It is already applied -- do not re-run it by hand.

-- EXECUTE on these routines is now granted to service_role only, so reaching them at all
-- already implies an authorised caller. The in-function role check is defence in depth
-- against a future re-grant.
--
-- It must therefore reject only a claim that is PRESENT and explicitly not service_role.
-- `auth.role()` reads request.jwt.claims, and a SECURITY DEFINER body cannot fall back to
-- current_user (that resolves to the function owner, not the caller). If a future API key
-- format stops populating that GUC, a fail-closed guard would raise on every hold and
-- every refund -- i.e. it would take checkout down. Fail open on an absent claim instead
-- and let the grant do the enforcing.

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
    -- Reject only a caller we positively know is neither the service role nor the user
    -- the hold is for. An absent claim is treated as authorised; see note above.
    if v_jwt_role <> '' and v_jwt_role <> 'service_role'
       and (auth.uid() is null or auth.uid() <> p_user_id) then
        raise exception 'UNAUTHORIZED_USER'
            using errcode = '42501';
    end if;

    if p_guests < 1 then
        raise exception 'INVALID_GUEST_COUNT';
    end if;

    update public.booking_holds
    set status = 'expired'
    where workshop_id = p_workshop_id
      and status = 'active'
      and expires_at < now();

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
