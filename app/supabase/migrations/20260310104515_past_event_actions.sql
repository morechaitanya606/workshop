create table if not exists public.workshop_notification_preferences (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    workshop_id text not null references public.workshops (id) on delete cascade,
    notify_similar boolean not null default false,
    notify_creator boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, workshop_id)
);

create table if not exists public.workshop_feedback (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    workshop_id text not null references public.workshops (id) on delete cascade,
    comment text not null check (char_length(trim(comment)) > 0 and char_length(comment) <= 2000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, workshop_id)
);

create index if not exists idx_workshop_notification_preferences_user_id
    on public.workshop_notification_preferences (user_id);
create index if not exists idx_workshop_notification_preferences_workshop_id
    on public.workshop_notification_preferences (workshop_id);
create index if not exists idx_workshop_feedback_user_id
    on public.workshop_feedback (user_id);
create index if not exists idx_workshop_feedback_workshop_id
    on public.workshop_feedback (workshop_id);

alter table public.workshop_notification_preferences enable row level security;
alter table public.workshop_feedback enable row level security;

drop policy if exists "workshop_notification_preferences_select_own" on public.workshop_notification_preferences;
create policy "workshop_notification_preferences_select_own"
on public.workshop_notification_preferences
for select
using (auth.uid() = user_id);

drop policy if exists "workshop_notification_preferences_insert_own" on public.workshop_notification_preferences;
create policy "workshop_notification_preferences_insert_own"
on public.workshop_notification_preferences
for insert
with check (auth.uid() = user_id);

drop policy if exists "workshop_notification_preferences_update_own" on public.workshop_notification_preferences;
create policy "workshop_notification_preferences_update_own"
on public.workshop_notification_preferences
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "workshop_feedback_select_own" on public.workshop_feedback;
create policy "workshop_feedback_select_own"
on public.workshop_feedback
for select
using (auth.uid() = user_id);

drop policy if exists "workshop_feedback_insert_own" on public.workshop_feedback;
create policy "workshop_feedback_insert_own"
on public.workshop_feedback
for insert
with check (auth.uid() = user_id);

drop policy if exists "workshop_feedback_update_own" on public.workshop_feedback;
create policy "workshop_feedback_update_own"
on public.workshop_feedback
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop trigger if exists set_workshop_notification_preferences_updated_at on public.workshop_notification_preferences;
create trigger set_workshop_notification_preferences_updated_at
before update on public.workshop_notification_preferences
for each row execute function public.set_updated_at();

drop trigger if exists set_workshop_feedback_updated_at on public.workshop_feedback;
create trigger set_workshop_feedback_updated_at
before update on public.workshop_feedback
for each row execute function public.set_updated_at();
