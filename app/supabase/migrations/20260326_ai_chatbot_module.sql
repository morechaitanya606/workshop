-- Migration: 20260326_ai_chatbot_module.sql
-- Description: Add FAQ, lead capture, and unanswered question storage for the AI chatbot module.

create table if not exists public.faq (
    id uuid primary key default gen_random_uuid(),
    question text not null unique,
    answer text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.faq
    add column if not exists question text,
    add column if not exists answer text,
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

create table if not exists public.leads (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    phone text not null,
    query text not null,
    created_at timestamptz not null default now()
);

alter table public.leads
    add column if not exists name text,
    add column if not exists phone text,
    add column if not exists query text,
    add column if not exists created_at timestamptz not null default now();

create table if not exists public.unanswered_questions (
    id uuid primary key default gen_random_uuid(),
    question text not null,
    created_at timestamptz not null default now()
);

alter table public.unanswered_questions
    add column if not exists question text,
    add column if not exists created_at timestamptz not null default now();

create index if not exists idx_faq_created_at
    on public.faq (created_at desc);

create index if not exists idx_faq_updated_at
    on public.faq (updated_at desc);

create index if not exists idx_leads_created_at
    on public.leads (created_at desc);

create index if not exists idx_unanswered_questions_created_at
    on public.unanswered_questions (created_at desc);

drop trigger if exists set_faq_updated_at on public.faq;
create trigger set_faq_updated_at
before update on public.faq
for each row execute function public.set_updated_at();

alter table public.faq enable row level security;
alter table public.leads enable row level security;
alter table public.unanswered_questions enable row level security;

drop policy if exists faq_public_read on public.faq;
drop policy if exists faq_admin_manage on public.faq;
drop policy if exists leads_admin_manage on public.leads;
drop policy if exists unanswered_questions_admin_manage on public.unanswered_questions;

create policy faq_public_read
on public.faq
for select
to anon, authenticated
using (true);

create policy faq_admin_manage
on public.faq
for all
using (public.user_has_role('admin'))
with check (public.user_has_role('admin'));

create policy leads_admin_manage
on public.leads
for all
using (public.user_has_role('admin'))
with check (public.user_has_role('admin'));

create policy unanswered_questions_admin_manage
on public.unanswered_questions
for all
using (public.user_has_role('admin'))
with check (public.user_has_role('admin'));

insert into public.faq (question, answer)
values
    (
        'Do I need any prior experience?',
        'Not at all. Our workshops are designed for complete beginners and hobbyists, and the host will guide you step by step.'
    ),
    (
        'What should I bring?',
        'Just bring yourself and your enthusiasm. Core workshop materials are provided at the venue, and comfortable clothes are recommended.'
    ),
    (
        'Is parking available at the venue?',
        'Parking availability depends on the venue. Please check the workshop location details or contact us for venue-specific parking information.'
    ),
    (
        'What if I need to cancel or reschedule?',
        'Cancellation and reschedule eligibility depends on the workshop policy and timing. Please contact us for the latest details on your booking.'
    ),
    (
        'Can I bring a friend who has not booked?',
        'Each attendee needs their own booking to participate. You can reserve multiple spots during booking if you want to attend together.'
    )
on conflict (question) do nothing;
