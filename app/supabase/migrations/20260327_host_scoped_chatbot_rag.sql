-- Migration: 20260327_host_scoped_chatbot_rag.sql
-- Description: Add host-scoped chatbot tenants, vector search, and tenant-safe chatbot policies.

create extension if not exists vector;

create table if not exists public.clients (
    id uuid primary key default gen_random_uuid(),
    host_user_id uuid references auth.users (id) on delete cascade,
    name text not null,
    api_key text not null unique,
    booking_url text,
    is_platform_default boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint clients_owner_or_platform_check
        check (is_platform_default or host_user_id is not null)
);

alter table public.clients
    add column if not exists host_user_id uuid references auth.users (id) on delete cascade,
    add column if not exists name text,
    add column if not exists api_key text,
    add column if not exists booking_url text,
    add column if not exists is_platform_default boolean not null default false,
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

update public.clients
set
    name = coalesce(nullif(trim(name), ''), 'Chatbot Client'),
    api_key = coalesce(nullif(trim(api_key), ''), encode(gen_random_bytes(24), 'hex'))
where name is null
   or trim(name) = ''
   or api_key is null
   or trim(api_key) = '';

alter table public.clients
    alter column name set not null,
    alter column api_key set not null;

create unique index if not exists idx_clients_host_user_id_unique
    on public.clients (host_user_id)
    where host_user_id is not null;

create unique index if not exists idx_clients_platform_default_unique
    on public.clients (is_platform_default)
    where is_platform_default = true;

create index if not exists idx_clients_api_key
    on public.clients (api_key);

drop trigger if exists set_clients_updated_at on public.clients;
create trigger set_clients_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

insert into public.clients (name, api_key, is_platform_default)
select
    'OnlyWorkshop Platform',
    encode(gen_random_bytes(24), 'hex'),
    true
where not exists (
    select 1
    from public.clients
    where is_platform_default = true
);

alter table public.faq
    add column if not exists client_id uuid references public.clients (id) on delete cascade,
    add column if not exists embedding vector(768);

alter table public.leads
    add column if not exists client_id uuid references public.clients (id) on delete cascade;

alter table public.unanswered_questions
    add column if not exists client_id uuid references public.clients (id) on delete cascade;

with platform_client as (
    select id
    from public.clients
    where is_platform_default = true
    limit 1
)
update public.faq
set client_id = platform_client.id
from platform_client
where public.faq.client_id is null;

with platform_client as (
    select id
    from public.clients
    where is_platform_default = true
    limit 1
)
update public.leads
set client_id = platform_client.id
from platform_client
where public.leads.client_id is null;

with platform_client as (
    select id
    from public.clients
    where is_platform_default = true
    limit 1
)
update public.unanswered_questions
set client_id = platform_client.id
from platform_client
where public.unanswered_questions.client_id is null;

alter table public.faq
    alter column client_id set not null;

alter table public.leads
    alter column client_id set not null;

alter table public.unanswered_questions
    alter column client_id set not null;

alter table public.faq drop constraint if exists faq_question_key;

create unique index if not exists idx_faq_client_question_unique
    on public.faq (client_id, question);

create index if not exists idx_faq_client_id
    on public.faq (client_id);

create index if not exists idx_leads_client_created_at
    on public.leads (client_id, created_at desc);

create index if not exists idx_unanswered_questions_client_created_at
    on public.unanswered_questions (client_id, created_at desc);

create index if not exists idx_faq_embedding_hnsw
    on public.faq using hnsw (embedding vector_cosine_ops)
    where embedding is not null;

create or replace function public.client_owned_by_current_user(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.clients c
        where c.id = p_client_id
          and c.host_user_id = auth.uid()
    );
$$;

grant execute on function public.client_owned_by_current_user(uuid)
to anon, authenticated, service_role;

create or replace function public.match_faqs(
    p_client_id uuid,
    p_query_embedding vector(768),
    p_match_count integer default 3
)
returns table (
    id uuid,
    client_id uuid,
    question text,
    answer text,
    similarity double precision
)
language sql
stable
security definer
set search_path = public
as $$
    select
        faq.id,
        faq.client_id,
        faq.question,
        faq.answer,
        1 - (faq.embedding <=> p_query_embedding) as similarity
    from public.faq
    where faq.client_id = p_client_id
      and faq.embedding is not null
    order by faq.embedding <=> p_query_embedding
    limit greatest(coalesce(p_match_count, 3), 1);
$$;

revoke all on function public.match_faqs(uuid, vector, integer)
from public, anon, authenticated;
grant execute on function public.match_faqs(uuid, vector, integer)
to service_role;

alter table public.clients enable row level security;
alter table public.faq enable row level security;
alter table public.leads enable row level security;
alter table public.unanswered_questions enable row level security;

do $$
declare
    p record;
begin
    for p in
        select policyname, tablename
        from pg_policies
        where schemaname = 'public'
          and tablename = any (array['clients', 'faq', 'leads', 'unanswered_questions'])
    loop
        execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
    end loop;
end;
$$;

create policy clients_select_own_or_admin
on public.clients
for select
using (
    public.user_has_role('admin')
    or public.client_owned_by_current_user(id)
);

create policy clients_insert_own_or_admin
on public.clients
for insert
with check (
    public.user_has_role('admin')
    or (
        host_user_id = auth.uid()
        and is_platform_default = false
    )
);

create policy clients_update_own_or_admin
on public.clients
for update
using (
    public.user_has_role('admin')
    or public.client_owned_by_current_user(id)
)
with check (
    public.user_has_role('admin')
    or (
        host_user_id = auth.uid()
        and is_platform_default = false
    )
);

create policy faq_select_own_or_admin
on public.faq
for select
using (
    public.user_has_role('admin')
    or public.client_owned_by_current_user(client_id)
);

create policy faq_insert_own_or_admin
on public.faq
for insert
with check (
    public.user_has_role('admin')
    or public.client_owned_by_current_user(client_id)
);

create policy faq_update_own_or_admin
on public.faq
for update
using (
    public.user_has_role('admin')
    or public.client_owned_by_current_user(client_id)
)
with check (
    public.user_has_role('admin')
    or public.client_owned_by_current_user(client_id)
);

create policy faq_delete_own_or_admin
on public.faq
for delete
using (
    public.user_has_role('admin')
    or public.client_owned_by_current_user(client_id)
);

create policy leads_select_own_or_admin
on public.leads
for select
using (
    public.user_has_role('admin')
    or public.client_owned_by_current_user(client_id)
);

create policy leads_insert_own_or_admin
on public.leads
for insert
with check (
    public.user_has_role('admin')
    or public.client_owned_by_current_user(client_id)
    or auth.role() = 'service_role'
);

create policy unanswered_select_own_or_admin
on public.unanswered_questions
for select
using (
    public.user_has_role('admin')
    or public.client_owned_by_current_user(client_id)
);

create policy unanswered_insert_own_or_admin
on public.unanswered_questions
for insert
with check (
    public.user_has_role('admin')
    or public.client_owned_by_current_user(client_id)
    or auth.role() = 'service_role'
);
