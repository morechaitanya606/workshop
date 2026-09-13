alter table public.workshop_feedback
add column if not exists rating smallint check (rating >= 1 and rating <= 5),
add column if not exists photos text[] not null default '{}',
add column if not exists video_url text;
