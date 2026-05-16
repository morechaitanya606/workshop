create table if not exists public.community_photos (
    id uuid primary key default gen_random_uuid(),
    image_url text not null,
    alt_text text not null default '',
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_community_photos_homepage
    on public.community_photos (is_active, sort_order, created_at desc);

alter table public.community_photos enable row level security;

drop trigger if exists set_community_photos_updated_at on public.community_photos;
create trigger set_community_photos_updated_at
before update on public.community_photos
for each row execute function public.set_updated_at();

drop policy if exists community_photos_select_active on public.community_photos;
create policy community_photos_select_active
on public.community_photos
for select
to anon, authenticated
using (is_active = true);

drop policy if exists community_photos_admin_manage on public.community_photos;
create policy community_photos_admin_manage
on public.community_photos
for all
to authenticated
using (public.user_has_role('admin'))
with check (public.user_has_role('admin'));
