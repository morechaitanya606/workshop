create table if not exists public.hosts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users (id) on delete set null,
    name text not null,
    bio text,
    avatar_url text,
    social_links jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.workshops
add column if not exists host_id uuid references public.hosts (id) on delete set null;

create table if not exists public.user_favorites (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    workshop_id text not null references public.workshops (id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (user_id, workshop_id)
);

create table if not exists public.payment_webhook_events (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    event_key text not null,
    event_type text not null,
    payload jsonb not null default '{}'::jsonb,
    received_at timestamptz not null default now(),
    processed_at timestamptz,
    unique (provider, event_key)
);

create index if not exists idx_workshops_city_date_category
    on public.workshops (city, date, category);
create index if not exists idx_bookings_user_created_at
    on public.bookings (user_id, created_at desc);
create index if not exists idx_bookings_workshop_created_at
    on public.bookings (workshop_id, created_at desc);
create index if not exists idx_user_favorites_user
    on public.user_favorites (user_id);
create index if not exists idx_user_favorites_workshop
    on public.user_favorites (workshop_id);
create index if not exists idx_payment_webhook_events_received
    on public.payment_webhook_events (received_at desc);

drop trigger if exists set_hosts_updated_at on public.hosts;
create trigger set_hosts_updated_at
before update on public.hosts
for each row execute function public.set_updated_at();

alter table public.hosts enable row level security;
alter table public.user_favorites enable row level security;
alter table public.payment_webhook_events enable row level security;

drop policy if exists "hosts_select_all" on public.hosts;
create policy "hosts_select_all"
on public.hosts
for select
using (true);

drop policy if exists "hosts_admin_manage" on public.hosts;
create policy "hosts_admin_manage"
on public.hosts
for all
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

drop policy if exists "user_favorites_select_own" on public.user_favorites;
create policy "user_favorites_select_own"
on public.user_favorites
for select
using (auth.uid() = user_id);

drop policy if exists "user_favorites_insert_own" on public.user_favorites;
create policy "user_favorites_insert_own"
on public.user_favorites
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_favorites_delete_own" on public.user_favorites;
create policy "user_favorites_delete_own"
on public.user_favorites
for delete
using (auth.uid() = user_id);

drop policy if exists "payment_webhook_events_service_only" on public.payment_webhook_events;
create policy "payment_webhook_events_service_only"
on public.payment_webhook_events
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
