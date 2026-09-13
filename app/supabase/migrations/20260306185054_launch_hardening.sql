create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    full_name text,
    role text not null default 'user' check (role in ('user', 'admin')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.workshops (
    id text primary key,
    title text not null,
    description text not null,
    category text not null,
    price integer not null check (price > 0),
    location text not null,
    city text not null,
    duration text not null,
    date date not null,
    time time not null,
    max_seats integer not null check (max_seats > 0),
    seats_remaining integer not null check (seats_remaining >= 0),
    cover_image text not null,
    gallery_images text[] not null default '{}',
    video_url text,
    social_links jsonb not null default '{}'::jsonb,
    host_name text not null,
    host_avatar text,
    host_bio text not null,
    host_experience text,
    host_social_links jsonb not null default '{}'::jsonb,
    what_you_learn text[] not null default '{}',
    materials_provided text[] not null default '{}',
    is_bestseller boolean not null default false,
    is_new boolean not null default false,
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.booking_holds (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    workshop_id text not null references public.workshops (id) on delete cascade,
    guests integer not null check (guests > 0),
    status text not null default 'active' check (status in ('active', 'confirmed', 'expired', 'released')),
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create table if not exists public.bookings (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    workshop_id text not null references public.workshops (id) on delete restrict,
    hold_id uuid references public.booking_holds (id) on delete set null,
    guests integer not null check (guests > 0),
    subtotal integer not null check (subtotal >= 0),
    service_fee integer not null check (service_fee >= 0),
    total integer not null check (total >= 0),
    status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'refunded')),
    payment_provider text,
    payment_intent_id text,
    first_name text not null,
    last_name text not null,
    email text not null,
    phone text,
    notes text,
    created_at timestamptz not null default now()
);

create index if not exists idx_workshops_date on public.workshops (date);
create index if not exists idx_workshops_city on public.workshops (city);
create index if not exists idx_workshops_category on public.workshops (category);
create index if not exists idx_bookings_user_id on public.bookings (user_id);
create index if not exists idx_booking_holds_workshop_id on public.booking_holds (workshop_id);
create index if not exists idx_booking_holds_expires_at on public.booking_holds (expires_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_workshops_updated_at on public.workshops;
create trigger set_workshops_updated_at
before update on public.workshops
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, full_name)
    values (new.id, new.raw_user_meta_data ->> 'full_name')
    on conflict (id) do update
    set full_name = excluded.full_name;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.workshops enable row level security;
alter table public.booking_holds enable row level security;
alter table public.bookings enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "workshops_select_all" on public.workshops;
create policy "workshops_select_all"
on public.workshops
for select
using (true);

drop policy if exists "workshops_admin_insert" on public.workshops;
create policy "workshops_admin_insert"
on public.workshops
for insert
with check (
    exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
    )
);

drop policy if exists "workshops_admin_update" on public.workshops;
create policy "workshops_admin_update"
on public.workshops
for update
using (
    exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
    )
)
with check (
    exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
    )
);

drop policy if exists "bookings_select_own" on public.bookings;
create policy "bookings_select_own"
on public.bookings
for select
using (auth.uid() = user_id);

drop policy if exists "booking_holds_select_own" on public.booking_holds;
create policy "booking_holds_select_own"
on public.booking_holds
for select
using (auth.uid() = user_id);

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

grant execute on function public.create_booking_hold(uuid, text, integer, integer) to authenticated, service_role;
grant execute on function public.confirm_booking_from_hold(uuid, uuid, text, text, text, text, text, text, text, text, integer) to authenticated, service_role;
