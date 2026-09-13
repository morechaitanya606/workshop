-- Migration: 20260311_host_onboarding_payouts.sql
-- Description: Host onboarding applications, earnings ledger, and manual payouts.

-- Enums (idempotent)
do $$
begin
    create type public.host_application_status as enum ('pending', 'approved', 'rejected');
exception
    when duplicate_object then null;
end;
$$;

do $$
begin
    create type public.earning_status as enum ('pending', 'available', 'paid');
exception
    when duplicate_object then null;
end;
$$;

do $$
begin
    create type public.payout_status as enum ('processing', 'completed');
exception
    when duplicate_object then null;
end;
$$;

-- Host applications
create table if not exists public.host_applications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    name text not null,
    email text not null,
    bio text not null,
    portfolio_url text,
    status public.host_application_status not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id)
);

-- Host earnings ledger (one earning record per booking)
create table if not exists public.host_earnings (
    id uuid primary key default gen_random_uuid(),
    host_id uuid not null references public.hosts (id) on delete cascade,
    booking_id uuid not null references public.bookings (id) on delete cascade,
    amount numeric(12, 2) not null check (amount >= 0),
    fee_deducted numeric(12, 2) not null default 0 check (fee_deducted >= 0),
    status public.earning_status not null default 'pending',
    created_at timestamptz not null default now(),
    unique (booking_id)
);

-- Manual payouts
create table if not exists public.payouts (
    id uuid primary key default gen_random_uuid(),
    host_id uuid not null references public.hosts (id) on delete cascade,
    amount numeric(12, 2) not null check (amount > 0),
    status public.payout_status not null default 'processing',
    reference_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Ensure updated_at columns exist for older partially-created tables
alter table public.host_applications
    add column if not exists updated_at timestamptz not null default now();

alter table public.payouts
    add column if not exists updated_at timestamptz not null default now();

-- Helpful indexes
create index if not exists idx_host_applications_status_created_at
    on public.host_applications (status, created_at desc);
create index if not exists idx_host_earnings_host_status_created_at
    on public.host_earnings (host_id, status, created_at desc);
create index if not exists idx_payouts_host_status_created_at
    on public.payouts (host_id, status, created_at desc);
create unique index if not exists idx_hosts_user_id_unique
    on public.hosts (user_id)
    where user_id is not null;

-- updated_at triggers
drop trigger if exists set_host_applications_updated_at on public.host_applications;
create trigger set_host_applications_updated_at
before update on public.host_applications
for each row execute function public.set_updated_at();

drop trigger if exists set_payouts_updated_at on public.payouts;
create trigger set_payouts_updated_at
before update on public.payouts
for each row execute function public.set_updated_at();

-- Enable RLS
alter table public.host_applications enable row level security;
alter table public.host_earnings enable row level security;
alter table public.payouts enable row level security;

-- Host applications policies
drop policy if exists "Users can view own application" on public.host_applications;
drop policy if exists "Users can insert own application" on public.host_applications;
drop policy if exists "Admins can manage all applications" on public.host_applications;
drop policy if exists host_applications_select_own on public.host_applications;
drop policy if exists host_applications_insert_own on public.host_applications;
drop policy if exists host_applications_admin_manage on public.host_applications;

create policy host_applications_select_own
on public.host_applications
for select
using (auth.uid() = user_id);

create policy host_applications_insert_own
on public.host_applications
for insert
with check (auth.uid() = user_id);

create policy host_applications_admin_manage
on public.host_applications
for all
using (public.user_has_role('admin'))
with check (public.user_has_role('admin'));

-- Host earnings policies
drop policy if exists "Hosts can view own earnings" on public.host_earnings;
drop policy if exists "Admins can manage all earnings" on public.host_earnings;
drop policy if exists host_earnings_select_own on public.host_earnings;
drop policy if exists host_earnings_admin_manage on public.host_earnings;

create policy host_earnings_select_own
on public.host_earnings
for select
using (
    exists (
        select 1
        from public.hosts h
        where h.id = host_earnings.host_id
          and h.user_id = auth.uid()
    )
);

create policy host_earnings_admin_manage
on public.host_earnings
for all
using (public.user_has_role('admin'))
with check (public.user_has_role('admin'));

-- Payout policies
drop policy if exists "Hosts can view own payouts" on public.payouts;
drop policy if exists "Admins can manage all payouts" on public.payouts;
drop policy if exists payouts_select_own on public.payouts;
drop policy if exists payouts_admin_manage on public.payouts;

create policy payouts_select_own
on public.payouts
for select
using (
    exists (
        select 1
        from public.hosts h
        where h.id = payouts.host_id
          and h.user_id = auth.uid()
    )
);

create policy payouts_admin_manage
on public.payouts
for all
using (public.user_has_role('admin'))
with check (public.user_has_role('admin'));
