-- Migration: 20260325_support_tickets.sql
-- Description: Add support tickets backing the support dashboard and chatbot escalation flow.

do $$
begin
    create type public.support_ticket_status as enum ('open', 'in_progress', 'resolved');
exception
    when duplicate_object then null;
end;
$$;

create table if not exists public.support_tickets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users (id) on delete set null,
    workshop_id uuid references public.workshops (id) on delete set null,
    email text not null,
    subject text not null,
    description text not null,
    status public.support_ticket_status not null default 'open',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.support_tickets
    add column if not exists user_id uuid references auth.users (id) on delete set null,
    add column if not exists workshop_id uuid references public.workshops (id) on delete set null,
    add column if not exists email text,
    add column if not exists subject text,
    add column if not exists description text,
    add column if not exists status public.support_ticket_status not null default 'open',
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_support_tickets_status_created_at
    on public.support_tickets (status, created_at desc);

create index if not exists idx_support_tickets_workshop_created_at
    on public.support_tickets (workshop_id, created_at desc);

create index if not exists idx_support_tickets_user_created_at
    on public.support_tickets (user_id, created_at desc);

drop trigger if exists set_support_tickets_updated_at on public.support_tickets;
create trigger set_support_tickets_updated_at
before update on public.support_tickets
for each row execute function public.set_updated_at();

alter table public.support_tickets enable row level security;

drop policy if exists support_tickets_insert_public on public.support_tickets;
drop policy if exists support_tickets_select_own on public.support_tickets;
drop policy if exists support_tickets_admin_manage on public.support_tickets;

create policy support_tickets_insert_public
on public.support_tickets
for insert
to anon, authenticated
with check (user_id is null or auth.uid() = user_id);

create policy support_tickets_select_own
on public.support_tickets
for select
to authenticated
using (auth.uid() = user_id);

create policy support_tickets_admin_manage
on public.support_tickets
for all
using (public.user_has_role('admin'))
with check (public.user_has_role('admin'));
