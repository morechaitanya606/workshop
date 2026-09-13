alter table public.workshops
    add column if not exists approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected'));

update public.workshops
set approval_status = 'approved'
where approval_status is null;

create index if not exists idx_workshops_approval_status
    on public.workshops (approval_status);

drop policy if exists "workshops_select_all" on public.workshops;
create policy "workshops_select_approved"
on public.workshops
for select
using (
    approval_status = 'approved'
    or auth.role() = 'service_role'
    or public.user_has_role('admin')
);

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
begin
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

create or replace function public.confirm_booking_from_hold(
    p_hold_id uuid,
    p_user_id uuid,
    p_workshop_id text,
    p_payment_provider text,
    p_payment_intent_id text,
    p_first_name text,
    p_last_name text,
    p_email text,
    p_phone text default null,
    p_notes text default null,
    p_service_fee integer default 99
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_hold public.booking_holds%rowtype;
    v_workshop public.workshops%rowtype;
    v_subtotal integer;
    v_total integer;
    v_booking_id uuid;
begin
    select * into v_hold
    from public.booking_holds
    where id = p_hold_id
      and user_id = p_user_id
      and workshop_id = p_workshop_id
    for update;

    if not found then
        raise exception 'HOLD_NOT_FOUND';
    end if;

    if v_hold.status <> 'active' then
        raise exception 'HOLD_NOT_ACTIVE';
    end if;

    if v_hold.expires_at < now() then
        update public.booking_holds
        set status = 'expired'
        where id = v_hold.id;
        raise exception 'HOLD_EXPIRED';
    end if;

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

    if v_workshop.seats_remaining < v_hold.guests then
        raise exception 'SEATS_UNAVAILABLE';
    end if;

    v_subtotal := v_workshop.price * v_hold.guests;
    v_total := v_subtotal + greatest(p_service_fee, 0);

    update public.workshops
    set seats_remaining = seats_remaining - v_hold.guests
    where id = p_workshop_id;

    insert into public.bookings (
        user_id,
        workshop_id,
        hold_id,
        guests,
        subtotal,
        service_fee,
        total,
        payment_provider,
        payment_intent_id,
        first_name,
        last_name,
        email,
        phone,
        notes,
        status
    ) values (
        p_user_id,
        p_workshop_id,
        p_hold_id,
        v_hold.guests,
        v_subtotal,
        greatest(p_service_fee, 0),
        v_total,
        p_payment_provider,
        p_payment_intent_id,
        p_first_name,
        p_last_name,
        p_email,
        p_phone,
        p_notes,
        'confirmed'
    )
    returning id into v_booking_id;

    update public.booking_holds
    set status = 'confirmed'
    where id = p_hold_id;

    return v_booking_id;
end;
$$;
