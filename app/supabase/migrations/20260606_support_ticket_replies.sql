-- Persist support ticket conversations and status updates.

create table if not exists public.support_ticket_replies (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null references public.support_tickets (id) on delete cascade,
    author_user_id uuid references auth.users (id) on delete set null,
    author_role text not null check (author_role in ('admin', 'host', 'user')),
    message text not null check (length(trim(message)) > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.support_ticket_replies
    add column if not exists ticket_id uuid references public.support_tickets (id) on delete cascade,
    add column if not exists author_user_id uuid references auth.users (id) on delete set null,
    add column if not exists author_role text not null default 'user',
    add column if not exists message text,
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

alter table public.support_ticket_replies
    alter column ticket_id set not null,
    alter column author_role set not null,
    alter column message set not null,
    alter column created_at set not null,
    alter column updated_at set not null;

do $$
begin
    alter table public.support_ticket_replies
        add constraint support_ticket_replies_author_role_check
        check (author_role in ('admin', 'host', 'user'));
exception
    when duplicate_object then null;
end;
$$;

do $$
begin
    alter table public.support_ticket_replies
        add constraint support_ticket_replies_message_not_blank
        check (length(trim(message)) > 0);
exception
    when duplicate_object then null;
end;
$$;

create index if not exists idx_support_ticket_replies_ticket_created_at
    on public.support_ticket_replies (ticket_id, created_at asc);

create index if not exists idx_support_ticket_replies_author_user_id
    on public.support_ticket_replies (author_user_id);

drop trigger if exists set_support_ticket_replies_updated_at on public.support_ticket_replies;
create trigger set_support_ticket_replies_updated_at
before update on public.support_ticket_replies
for each row execute function public.set_updated_at();

alter table public.support_ticket_replies enable row level security;

grant select, insert, update on public.support_ticket_replies to authenticated;
grant select, insert, update, delete on public.support_ticket_replies to service_role;

drop policy if exists support_ticket_replies_select_own_ticket on public.support_ticket_replies;
drop policy if exists support_ticket_replies_insert_own_ticket on public.support_ticket_replies;
drop policy if exists support_ticket_replies_admin_manage on public.support_ticket_replies;

create policy support_ticket_replies_select_own_ticket
on public.support_ticket_replies
for select
to authenticated
using (
    exists (
        select 1
        from public.support_tickets as ticket
        where ticket.id = support_ticket_replies.ticket_id
          and ticket.user_id = (select auth.uid())
    )
);

create policy support_ticket_replies_insert_own_ticket
on public.support_ticket_replies
for insert
to authenticated
with check (
    author_role = 'user'
    and author_user_id = (select auth.uid())
    and exists (
        select 1
        from public.support_tickets as ticket
        where ticket.id = support_ticket_replies.ticket_id
          and ticket.user_id = (select auth.uid())
    )
);

create policy support_ticket_replies_admin_manage
on public.support_ticket_replies
for all
to authenticated
using (public.user_has_role('admin'))
with check (public.user_has_role('admin'));
