create table if not exists public.communities (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    title text not null,
    summary text not null,
    description text not null,
    category text not null,
    city text not null,
    host_name text not null,
    host_email text not null,
    host_phone text not null,
    meeting_format text not null default 'Offline',
    meetup_frequency text not null,
    cover_image text,
    instagram_url text,
    website_url text,
    whatsapp_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.community_join_requests (
    id uuid primary key default gen_random_uuid(),
    community_id uuid not null references public.communities (id) on delete cascade,
    full_name text not null,
    email text not null,
    phone text not null,
    note text,
    status text not null default 'pending',
    created_at timestamptz not null default now()
);

create index if not exists idx_communities_slug on public.communities (slug);
create index if not exists idx_community_join_requests_community_id
    on public.community_join_requests (community_id);

alter table public.communities enable row level security;
alter table public.community_join_requests enable row level security;

drop trigger if exists set_communities_updated_at on public.communities;
create trigger set_communities_updated_at
before update on public.communities
for each row execute function public.set_updated_at();

drop policy if exists communities_select_public on public.communities;
create policy communities_select_public
on public.communities
for select
to anon, authenticated
using (true);

drop policy if exists communities_admin_manage on public.communities;
create policy communities_admin_manage
on public.communities
for all
using (public.user_has_role('admin'))
with check (public.user_has_role('admin'));

drop policy if exists community_join_requests_admin_manage on public.community_join_requests;
create policy community_join_requests_admin_manage
on public.community_join_requests
for all
using (public.user_has_role('admin'))
with check (public.user_has_role('admin'));
