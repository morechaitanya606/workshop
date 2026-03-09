-- =============================================================================
-- Migration: Full RLS role hardening and policy matrix
-- Date: 2026-03-09
-- =============================================================================

-- 1) Expand profiles.role to include host
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
    add constraint profiles_role_check
    check (role in ('user', 'host', 'admin'));

-- 2) Add host_user_id to workshops and backfill from created_by
alter table public.workshops
    add column if not exists host_user_id uuid references auth.users (id) on delete set null;

update public.workshops
set host_user_id = created_by
where host_user_id is null
  and created_by is not null;

create index if not exists idx_workshops_host_user_id
    on public.workshops (host_user_id);

-- 3) Helper role functions for cleaner policies
create or replace function public.user_has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = required_role
    );
$$;

create or replace function public.user_has_any_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = any(required_roles)
    );
$$;

grant execute on function public.user_has_role(text) to anon, authenticated, service_role;
grant execute on function public.user_has_any_role(text[]) to anon, authenticated, service_role;

-- 4) Ensure RLS is enabled on target tables
alter table if exists public.profiles enable row level security;
alter table if exists public.workshops enable row level security;
alter table if exists public.bookings enable row level security;
alter table if exists public.booking_holds enable row level security;
alter table if exists public.workshop_feedback enable row level security;
alter table if exists public.workshop_notification_preferences enable row level security;
alter table if exists public.user_favorites enable row level security;
alter table if exists public.hosts enable row level security;
alter table if exists public.payment_webhook_events enable row level security;

-- 5) Drop existing policies on the managed tables so policy set stays canonical
do $$
declare
    p record;
begin
    for p in
        select policyname, tablename
        from pg_policies
        where schemaname = 'public'
          and tablename = any (array[
              'profiles',
              'workshops',
              'bookings',
              'booking_holds',
              'workshop_feedback',
              'workshop_notification_preferences',
              'user_favorites',
              'hosts',
              'payment_webhook_events'
          ])
    loop
        execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
    end loop;
end;
$$;

-- =============================================================================
-- PROFILES
-- =============================================================================

-- select: own row or admin
create policy profiles_select_own_or_admin
on public.profiles
for select
using (
    auth.uid() = id
    or public.user_has_role('admin')
);

-- insert: own row only
create policy profiles_insert_own
on public.profiles
for insert
with check (auth.uid() = id);

-- update: own row only; role must remain unchanged
create policy profiles_update_own_non_role
on public.profiles
for update
using (auth.uid() = id)
with check (
    auth.uid() = id
    and role = (
        select p.role
        from public.profiles p
        where p.id = auth.uid()
    )
);

-- =============================================================================
-- WORKSHOPS
-- =============================================================================

-- select: public
create policy workshops_select_all
on public.workshops
for select
using (true);

-- insert: admin any OR host only for own host_user_id
create policy workshops_insert_admin_or_host_own
on public.workshops
for insert
with check (
    public.user_has_role('admin')
    or (
        public.user_has_role('host')
        and host_user_id = auth.uid()
    )
);

-- update: admin any OR host only own workshops
create policy workshops_update_admin_or_host_own
on public.workshops
for update
using (
    public.user_has_role('admin')
    or (
        public.user_has_role('host')
        and host_user_id = auth.uid()
    )
)
with check (
    public.user_has_role('admin')
    or (
        public.user_has_role('host')
        and host_user_id = auth.uid()
    )
);

-- delete: admin only
create policy workshops_delete_admin_only
on public.workshops
for delete
using (public.user_has_role('admin'));

-- =============================================================================
-- BOOKINGS
-- =============================================================================

-- select: own bookings, admin, or host for own workshops
create policy bookings_select_own_or_admin_or_host
on public.bookings
for select
using (
    auth.uid() = user_id
    or public.user_has_role('admin')
    or (
        public.user_has_role('host')
        and exists (
            select 1
            from public.workshops w
            where w.id = bookings.workshop_id
              and w.host_user_id = auth.uid()
        )
    )
);

-- insert: service role only (RPC/server path)
create policy bookings_insert_service_only
on public.bookings
for insert
with check (auth.role() = 'service_role');

-- update: admin only
create policy bookings_update_admin_only
on public.bookings
for update
using (public.user_has_role('admin'))
with check (public.user_has_role('admin'));

-- =============================================================================
-- BOOKING HOLDS
-- =============================================================================

-- select: own holds or admin
create policy booking_holds_select_own_or_admin
on public.booking_holds
for select
using (
    auth.uid() = user_id
    or public.user_has_role('admin')
);

-- insert: service role only
create policy booking_holds_insert_service_only
on public.booking_holds
for insert
with check (auth.role() = 'service_role');

-- update: service role only
create policy booking_holds_update_service_only
on public.booking_holds
for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- =============================================================================
-- WORKSHOP FEEDBACK
-- =============================================================================

-- select: public read
create policy workshop_feedback_select_public
on public.workshop_feedback
for select
using (true);

-- insert: authenticated own row
create policy workshop_feedback_insert_own
on public.workshop_feedback
for insert
with check (auth.uid() = user_id);

-- update: own row only
create policy workshop_feedback_update_own
on public.workshop_feedback
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- delete: admin only
create policy workshop_feedback_delete_admin_only
on public.workshop_feedback
for delete
using (public.user_has_role('admin'));

-- =============================================================================
-- WORKSHOP NOTIFICATION PREFERENCES
-- =============================================================================

create policy notification_prefs_select_own
on public.workshop_notification_preferences
for select
using (auth.uid() = user_id);

create policy notification_prefs_insert_own
on public.workshop_notification_preferences
for insert
with check (auth.uid() = user_id);

create policy notification_prefs_update_own
on public.workshop_notification_preferences
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy notification_prefs_delete_own
on public.workshop_notification_preferences
for delete
using (auth.uid() = user_id);

-- =============================================================================
-- USER FAVORITES
-- =============================================================================

create policy user_favorites_select_own
on public.user_favorites
for select
using (auth.uid() = user_id);

create policy user_favorites_insert_own
on public.user_favorites
for insert
with check (auth.uid() = user_id);

create policy user_favorites_delete_own
on public.user_favorites
for delete
using (auth.uid() = user_id);

-- =============================================================================
-- HOSTS
-- =============================================================================

-- select: public
create policy hosts_select_all
on public.hosts
for select
using (true);

-- insert: admin only
create policy hosts_insert_admin_only
on public.hosts
for insert
with check (public.user_has_role('admin'));

-- update: admin any OR host own
create policy hosts_update_admin_or_host_own
on public.hosts
for update
using (
    public.user_has_role('admin')
    or (
        public.user_has_role('host')
        and user_id = auth.uid()
    )
)
with check (
    public.user_has_role('admin')
    or (
        public.user_has_role('host')
        and user_id = auth.uid()
    )
);

-- delete: admin only
create policy hosts_delete_admin_only
on public.hosts
for delete
using (public.user_has_role('admin'));

-- =============================================================================
-- PAYMENT WEBHOOK EVENTS
-- =============================================================================

create policy payment_webhook_events_select_service_only
on public.payment_webhook_events
for select
using (auth.role() = 'service_role');

create policy payment_webhook_events_insert_service_only
on public.payment_webhook_events
for insert
with check (auth.role() = 'service_role');

create policy payment_webhook_events_update_service_only
on public.payment_webhook_events
for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
