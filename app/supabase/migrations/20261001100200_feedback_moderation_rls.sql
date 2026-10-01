-- Close the review-moderation bypass on workshop_feedback.
--
-- The effective policies were (after 20260310104615 and the initplan rewrite):
--   select  using (true)                      -> anyone could read UNPUBLISHED reviews
--   insert  with check (auth.uid() = user_id) -> any user could insert is_published = true
--   update  using/with check own row          -> any user could flip is_published back on
-- so the admin gate added by 20260912171433 was decorative for anyone holding a session.
--
-- The application writes reviews through the service role (/api/workshops/[id]/feedback and
-- /api/admin/feedback/[id]), which bypasses RLS, so users need no write policy at all.
--
-- APPLICATION NOTE: the service role also performs the user's own edit (an upsert), and the
-- database cannot tell that apart from an admin edit. The route must therefore send
-- `is_published: false, published_at: null` in that upsert so an edited review goes back to
-- moderation. The trigger below enforces the same thing for every non-service, non-admin caller.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Policies: rebuilt from scratch so drifted/renamed policies cannot survive
-- ---------------------------------------------------------------------------

alter table public.workshop_feedback enable row level security;

do $$
declare
    p record;
begin
    for p in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = 'workshop_feedback'
    loop
        execute format('drop policy if exists %I on public.workshop_feedback', p.policyname);
    end loop;
end;
$$;

-- Published reviews are public; a user also sees their own (so they can see "awaiting
-- moderation"); admins see everything.
create policy workshop_feedback_select_published_or_own
on public.workshop_feedback
for select
using (
    is_published
    or (select auth.uid()) = user_id
    or (select public.user_has_role('admin'))
);

create policy workshop_feedback_delete_admin_only
on public.workshop_feedback
for delete
using ((select public.user_has_role('admin')));

-- No insert/update policy: with RLS enabled and no policy, those commands are denied for
-- anon/authenticated. The service role bypasses RLS.

-- ---------------------------------------------------------------------------
-- 2. Edited reviews return to moderation (defence in depth)
-- ---------------------------------------------------------------------------

-- Skips service_role, admins and callers with no JWT role at all (migrations, the SQL editor,
-- the postgres role), and nested trigger/FK-action writes (pg_trigger_depth() > 1, e.g. the
-- ON DELETE SET NULL on moderated_by). Anyone else -- i.e. a user session -- cannot publish a
-- review, cannot touch moderation fields, and loses publication if they change the content.
create or replace function private.guard_workshop_feedback_moderation()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
    v_role text := coalesce(auth.role(), '');
begin
    if v_role = ''
       or v_role = 'service_role'
       or pg_trigger_depth() > 1
       or public.user_has_role('admin') then
        return new;
    end if;

    if tg_op = 'INSERT' then
        new.is_published := false;
        new.published_at := null;
        new.moderated_by := null;
        new.moderated_at := null;
        return new;
    end if;

    if new.rating is distinct from old.rating
       or new.comment is distinct from old.comment
       or new.photos is distinct from old.photos
       or new.video_url is distinct from old.video_url then
        new.is_published := false;
        new.published_at := null;
        new.moderated_by := null;
        new.moderated_at := null;
    else
        -- Content unchanged: moderation columns are not the caller's to change.
        new.is_published := old.is_published;
        new.published_at := old.published_at;
        new.moderated_by := old.moderated_by;
        new.moderated_at := old.moderated_at;
    end if;

    return new;
end;
$$;

revoke all on function private.guard_workshop_feedback_moderation() from public, anon, authenticated;

drop trigger if exists guard_workshop_feedback_moderation on public.workshop_feedback;
create trigger guard_workshop_feedback_moderation
before insert or update on public.workshop_feedback
for each row execute function private.guard_workshop_feedback_moderation();

-- ---------------------------------------------------------------------------
-- 3. Admin dashboard average must ignore unpublished reviews
-- ---------------------------------------------------------------------------

-- Same body as 20260912171456_production_lockdown.sql plus `and f.is_published`, so the
-- headline rating agrees with workshops.rating (which already counts published reviews only).
-- CREATE OR REPLACE keeps the existing grants (service_role only); re-asserted below anyway.
create or replace function public.admin_dashboard_stats(p_reset_at timestamptz)
returns table (
    active_workshops integer,
    total_booked_seats integer,
    revenue numeric,
    avg_rating numeric
)
language sql
stable
security definer
set search_path = public
as $$
    with scoped_workshops as (
        select id from public.workshops where created_at >= p_reset_at
    )
    select
        (select count(*)::integer from scoped_workshops),
        coalesce((
            select sum(b.guests)::integer
            from public.bookings b
            join scoped_workshops w on w.id = b.workshop_id
            where b.status = 'confirmed'
        ), 0),
        coalesce((
            select sum(b.total)::numeric
            from public.bookings b
            join scoped_workshops w on w.id = b.workshop_id
            where b.status = 'confirmed'
        ), 0),
        (
            select round(avg(f.rating)::numeric, 1)
            from public.workshop_feedback f
            join scoped_workshops w on w.id = f.workshop_id
            where f.rating is not null
              and f.is_published
        );
$$;

revoke all on function public.admin_dashboard_stats(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_dashboard_stats(timestamptz) to service_role;
