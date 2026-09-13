alter table public.workshops
    add column if not exists badge_labels text[] default '{}';