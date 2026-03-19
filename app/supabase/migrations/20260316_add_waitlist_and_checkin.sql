-- Migration: 20260316_add_waitlist_and_checkin.sql
-- Notes:
-- - Keep statements idempotent (safe to re-apply).
-- - Admin check uses profiles.role = 'admin' (no profiles.is_admin column).

do $$
begin
    create type public.waitlist_status as enum ('pending', 'notified', 'joined');
exception
    when duplicate_object then null;
end;
$$;

create table if not exists public.waitlists (
    id uuid primary key default gen_random_uuid(),
    workshop_id text references public.workshops(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null,
    email text not null,
    status public.waitlist_status not null default 'pending',
    created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.bookings
    add column if not exists attended boolean not null default false;

create index if not exists idx_waitlists_workshop on public.waitlists(workshop_id);
create index if not exists idx_waitlists_user on public.waitlists(user_id);
create index if not exists idx_waitlists_email on public.waitlists(email);

alter table public.waitlists enable row level security;

drop policy if exists "Users can insert their own waitlist entries" on public.waitlists;
drop policy if exists "Users can view their own waitlist entries" on public.waitlists;
drop policy if exists "Hosts can view waitlists for their workshops" on public.waitlists;
drop policy if exists "Admins can do anything on waitlists" on public.waitlists;

create policy "Users can insert their own waitlist entries"
    on public.waitlists for insert
    with check (auth.uid() = user_id or user_id is null);

create policy "Users can view their own waitlist entries"
    on public.waitlists for select
    using (auth.uid() = user_id);

create policy "Hosts can view waitlists for their workshops"
    on public.waitlists for select
    using (
        exists (
            select 1
            from public.workshops w
            where w.id = waitlists.workshop_id
              and w.host_user_id = auth.uid()
        )
    );

create policy "Admins can do anything on waitlists"
    on public.waitlists for all
    using (public.user_has_role('admin'))
    with check (public.user_has_role('admin'));
