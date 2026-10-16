-- Store each host and each workshop's reusable details once.
--
-- `workshops` holds one row per session (date + time), and every row repeated the host's name,
-- bio and links and the whole workshop description. Admins and hosts therefore retyped the same
-- details for every new date. This adds two canonical tables the create forms read from and
-- write to:
--
--   host_profiles       one row per host (matched by a normalised name)
--   workshop_templates  one row per workshop (host + title + city + venue), holding everything
--                       except date, time and seats
--
-- and links each session row to them (host_profile_id, template_id).
--
-- Additive only: no workshops column is renamed or dropped, so the code currently on `main`
-- keeps working before and after this is applied. The session rows still carry their own copy of
-- the details for the existing read paths; the canonical copy is what the forms reuse, and a
-- unique key stops the same host or workshop being written twice.

create table if not exists public.host_profiles (
    id uuid primary key default gen_random_uuid(),
    -- lower(btrim(name)) with inner whitespace collapsed; the dedupe key.
    name_key text not null unique,
    name text not null,
    bio text not null default '',
    experience text,
    avatar text,
    social_links jsonb not null default '{}'::jsonb,
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.workshop_templates (
    id uuid primary key default gen_random_uuid(),
    -- host key | title key | city key | venue key, each normalised as above.
    template_key text not null unique,
    host_profile_id uuid references public.host_profiles (id) on delete set null,
    title text not null,
    description text not null,
    category text not null,
    price integer not null check (price > 0),
    location text not null,
    city text not null,
    duration text not null,
    max_seats integer not null check (max_seats > 0),
    cover_image text not null,
    gallery_images text[] not null default '{}',
    video_url text,
    social_links jsonb not null default '{}'::jsonb,
    what_you_learn text[] not null default '{}',
    materials_provided text[] not null default '{}',
    badge_labels text[] not null default '{}',
    event_address text,
    latitude double precision,
    longitude double precision,
    location_images text[] not null default '{}',
    early_bird_enabled boolean not null default false,
    early_bird_discount_type text not null default 'percentage',
    early_bird_discount_value integer not null default 0,
    early_bird_days_after_listing integer not null default 0,
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_workshop_templates_host_profile_id
    on public.workshop_templates (host_profile_id);

alter table public.workshops
    add column if not exists host_profile_id uuid
        references public.host_profiles (id) on delete set null,
    add column if not exists template_id uuid
        references public.workshop_templates (id) on delete set null;

create index if not exists idx_workshops_host_profile_id on public.workshops (host_profile_id);
create index if not exists idx_workshops_template_id on public.workshops (template_id);

drop trigger if exists set_host_profiles_updated_at on public.host_profiles;
create trigger set_host_profiles_updated_at
before update on public.host_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_workshop_templates_updated_at on public.workshop_templates;
create trigger set_workshop_templates_updated_at
before update on public.workshop_templates
for each row execute function public.set_updated_at();

-- Server only: the admin/host API routes use the service role, which bypasses RLS. State that
-- explicitly (see email_delivery_logs_explicit_policy) so no browser role can read or write them.
alter table public.host_profiles enable row level security;
alter table public.workshop_templates enable row level security;

drop policy if exists host_profiles_no_client_access on public.host_profiles;
create policy host_profiles_no_client_access
on public.host_profiles
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists workshop_templates_no_client_access on public.workshop_templates;
create policy workshop_templates_no_client_access
on public.workshop_templates
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.host_profiles from anon, authenticated;
revoke all on table public.workshop_templates from anon, authenticated;

-- Backfill from the existing session rows. The most recently created row of each group wins,
-- since a later copy is the likeliest to hold corrected details.
insert into public.host_profiles (name_key, name, bio, experience, avatar, social_links, created_by)
select distinct on (key)
    key,
    btrim(w.host_name),
    w.host_bio,
    w.host_experience,
    w.host_avatar,
    w.host_social_links,
    w.created_by
from (
    select
        lower(regexp_replace(btrim(host_name), '\s+', ' ', 'g')) as key,
        *
    from public.workshops
    where btrim(host_name) <> ''
) w
order by key, w.created_at desc
on conflict (name_key) do nothing;

insert into public.workshop_templates (
    template_key, host_profile_id, title, description, category, price, location, city, duration,
    max_seats, cover_image, gallery_images, video_url, social_links, what_you_learn,
    materials_provided, badge_labels, event_address, latitude, longitude, location_images,
    early_bird_enabled, early_bird_discount_type, early_bird_discount_value,
    early_bird_days_after_listing, created_by
)
select distinct on (w.template_key)
    w.template_key, hp.id, w.title, w.description, w.category, w.price, w.location, w.city,
    w.duration, w.max_seats, w.cover_image, w.gallery_images, w.video_url, w.social_links,
    w.what_you_learn, w.materials_provided, coalesce(w.badge_labels, '{}'),
    w.event_address, w.latitude, w.longitude, coalesce(w.location_images, '{}'),
    coalesce(w.early_bird_enabled, false), coalesce(w.early_bird_discount_type, 'percentage'),
    coalesce(w.early_bird_discount_value, 0), coalesce(w.early_bird_days_after_listing, 0),
    w.created_by
from (
    select
        concat_ws(
            '|',
            lower(regexp_replace(btrim(host_name), '\s+', ' ', 'g')),
            lower(regexp_replace(btrim(title), '\s+', ' ', 'g')),
            lower(regexp_replace(btrim(city), '\s+', ' ', 'g')),
            lower(regexp_replace(btrim(location), '\s+', ' ', 'g'))
        ) as template_key,
        lower(regexp_replace(btrim(host_name), '\s+', ' ', 'g')) as host_key,
        *
    from public.workshops
) w
left join public.host_profiles hp on hp.name_key = w.host_key
order by w.template_key, w.created_at desc
on conflict (template_key) do nothing;

update public.workshops w
set
    host_profile_id = hp.id,
    template_id = wt.id
from public.host_profiles hp, public.workshop_templates wt
where hp.name_key = lower(regexp_replace(btrim(w.host_name), '\s+', ' ', 'g'))
  and wt.template_key = concat_ws(
        '|',
        lower(regexp_replace(btrim(w.host_name), '\s+', ' ', 'g')),
        lower(regexp_replace(btrim(w.title), '\s+', ' ', 'g')),
        lower(regexp_replace(btrim(w.city), '\s+', ' ', 'g')),
        lower(regexp_replace(btrim(w.location), '\s+', ' ', 'g'))
    )
  and w.template_id is null;
