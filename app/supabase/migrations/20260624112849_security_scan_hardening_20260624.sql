-- Harden privileged RPCs exposed through earlier migrations.

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
    v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
    if v_jwt_role <> 'service_role'
       and (auth.uid() is null or auth.uid() <> p_user_id) then
        raise exception 'UNAUTHORIZED_USER'
            using errcode = '42501';
    end if;

    if p_guests < 1 then
        raise exception 'INVALID_GUEST_COUNT';
    end if;

    update public.booking_holds
    set status = 'expired'
    where status = 'active'
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

create or replace function public.increment_coupon_usage(p_coupon_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
        raise exception 'UNAUTHORIZED_ROLE'
            using errcode = '42501';
    end if;

    update public.coupons
    set used_count = coalesce(used_count, 0) + 1
    where id = p_coupon_id;
end;
$$;

revoke all on function public.increment_coupon_usage(uuid)
from public, anon, authenticated;

grant execute on function public.increment_coupon_usage(uuid)
to service_role;

create or replace function public.decrement_seats(p_workshop_id uuid, p_count int)
returns table(id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
        raise exception 'UNAUTHORIZED_ROLE'
            using errcode = '42501';
    end if;

    return query
    update public.workshops
    set seats_remaining = seats_remaining - p_count
    where workshops.id = p_workshop_id
      and seats_remaining >= p_count
    returning workshops.id;
end;
$$;

revoke all on function public.decrement_seats(uuid, int)
from public, anon, authenticated;

grant execute on function public.decrement_seats(uuid, int)
to service_role;
