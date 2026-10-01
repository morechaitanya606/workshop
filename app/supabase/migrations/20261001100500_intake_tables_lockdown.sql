-- Public intake tables: waitlists, support_tickets, profiles, communities.
--
-- Everything the application writes here goes through the service role (verified by grep in
-- src: api/workshops/[id]/waitlist, api/support, api/communities/[slug]/join, api/profile and
-- lib/api-auth all use the service client), and the service role bypasses RLS. The direct
-- insert policies below therefore only ever served callers going AROUND the API validation,
-- rate limiting and CAPTCHA-style checks, using nothing but the publishable key.

-- ---------------------------------------------------------------------------
-- 6. waitlists  (the task called it "waitlist"; the table is public.waitlists)
-- ---------------------------------------------------------------------------

-- Drop every INSERT policy (the repo's "Users can insert their own waitlist entries" applied
-- to PUBLIC and allowed `user_id is null`, i.e. anonymous spam with arbitrary emails).
-- The admin FOR ALL policy is untouched.
do $$
declare
    p record;
begin
    for p in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = 'waitlists' and cmd = 'INSERT'
    loop
        execute format('drop policy if exists %I on public.waitlists', p.policyname);
    end loop;
end;
$$;

-- Dedupe on (workshop, lower(email)): keep the row that has progressed furthest
-- (notified/joined beats pending), then the oldest. The rest are deleted.
delete from public.waitlists as w
using (
    select id,
           row_number() over (
               partition by workshop_id, lower(email)
               order by (status <> 'pending') desc, created_at asc, id
           ) as rn
    from public.waitlists
    where workshop_id is not null
) as d
where w.id = d.id
  and d.rn > 1;

create unique index if not exists uq_waitlists_workshop_email
    on public.waitlists (workshop_id, lower(email));

-- workshop_id was nullable, which both let a row ignore the unique index (NULLs are distinct)
-- and meant "waitlisted for nothing". Enforce it when the data allows; never delete rows to do it.
do $$
begin
    if exists (select 1 from public.waitlists where workshop_id is null) then
        raise warning 'waitlists.workshop_id left nullable: rows with NULL workshop_id exist. Clean them up, then: alter table public.waitlists alter column workshop_id set not null;';
    else
        alter table public.waitlists alter column workshop_id set not null;
    end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. support_tickets: no direct insert
-- ---------------------------------------------------------------------------

-- support_tickets_insert_public (anon + authenticated) let anyone insert tickets with
-- arbitrary email/subject/description straight through PostgREST. NOTE: api/support POST falls
-- back to the anon client when the service client is unavailable; that fallback stops working
-- with this change. In production the service key is required anyway.
do $$
declare
    p record;
begin
    for p in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = 'support_tickets' and cmd = 'INSERT'
    loop
        execute format('drop policy if exists %I on public.support_tickets', p.policyname);
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. profiles: an inserted profile can only be a plain user
-- ---------------------------------------------------------------------------

-- profiles_insert_own only checked auth.uid() = id, so a user whose profile row did not exist
-- yet could insert it with role = 'admin' (the UPDATE policy pins role, INSERT did not).
-- Profiles are normally created by handle_new_auth_user (SECURITY DEFINER) and by the service
-- role, both unaffected.
do $$
declare
    p record;
begin
    for p in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = 'profiles' and cmd = 'INSERT'
    loop
        execute format('drop policy if exists %I on public.profiles', p.policyname);
    end loop;
end;
$$;

create policy profiles_insert_own
on public.profiles
for insert
with check ((select auth.uid()) = id and role = 'user');

-- ---------------------------------------------------------------------------
-- 12. communities: host contact details are not for the publishable key
-- ---------------------------------------------------------------------------

-- communities_select_public (anon + authenticated, using (true)) exposed host_email and
-- host_phone for EVERY community to a bulk `GET /rest/v1/communities`. Every read in src goes
-- through the service role (lib/communities.ts callers: community-page-data.ts, api/communities,
-- sitemap.ts), so the public pages are unaffected: they render the host contact server-side.
--
-- Column-level privileges: take away table-wide SELECT from the API roles and grant it back
-- on every column EXCEPT the two contact columns. Built from information_schema so it follows
-- the real table, not the repo's idea of it. Idempotent.
--
-- Trade-offs: (a) a column added later is not readable by anon/authenticated until it is
-- granted -- intentional, new columns start private; (b) `select *` through the anon or a user
-- client now fails with "permission denied"; nothing in src does that; (c) the community detail
-- page still PRINTS the host email/phone to every visitor -- that is a product decision this
-- migration does not change, it only stops bulk harvesting through the API.
do $$
declare
    v_cols text;
begin
    select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'communities'
      and column_name not in ('host_email', 'host_phone');

    if v_cols is null then
        return;
    end if;

    execute 'revoke select on public.communities from anon, authenticated';
    execute format('grant select (%s) on public.communities to anon, authenticated', v_cols);
end;
$$;

-- One join request per person per community. Keep the one that has progressed furthest
-- (anything other than 'pending'), then the oldest; delete the rest. The join route is being
-- changed to upsert, so a repeat submission updates instead of erroring.
delete from public.community_join_requests as r
using (
    select id,
           row_number() over (
               partition by community_id, lower(email)
               order by (status <> 'pending') desc, created_at asc, id
           ) as rn
    from public.community_join_requests
) as d
where r.id = d.id
  and d.rn > 1;

create unique index if not exists uq_community_join_requests_community_email
    on public.community_join_requests (community_id, lower(email));
