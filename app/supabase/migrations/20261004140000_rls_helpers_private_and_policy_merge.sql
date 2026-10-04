-- Supabase advisor clean-up, part 2 (2026-10-04): RLS helpers out of the API, and one permissive
-- policy per table, role and action. Access is unchanged: before/after access matrices were
-- compared in a PGlite (Postgres 18) build of every migration for anon, two users, a host and an
-- admin on all 25 RLS tables -- identical.

-- ---------------------------------------------------------------------------
-- 1. Move the RLS helper functions out of the API-exposed `public` schema
--    (lints 0028/0029 *_security_definer_function_executable)
-- ---------------------------------------------------------------------------
-- user_has_role() and client_owned_by_current_user() were callable as /rest/v1/rpc/... by
-- anyone. 37 policies on 21 tables use them; a policy stores the function by OID, so those
-- follow the move untouched. EXECUTE stays granted to anon and authenticated because policies
-- run as the querying role. Only function BODIES resolve names at run time: the two private
-- guard triggers that call public.user_has_role() are redefined below.
-- New migrations must call private.user_has_role() / private.client_owned_by_current_user().
alter function public.user_has_role(text) set schema private;
alter function public.client_owned_by_current_user(uuid) set schema private;

revoke all on function private.user_has_role(text) from public;
revoke all on function private.client_owned_by_current_user(uuid) from public;
grant execute on function private.user_has_role(text) to anon, authenticated, service_role;
grant execute on function private.client_owned_by_current_user(uuid) to anon, authenticated, service_role;

-- The guard triggers are SECURITY INVOKER, so their call to private.user_has_role() is looked up
-- as the signed-in user, who needs USAGE on `private` (without it every host/admin workshop
-- write fails with 42501). `private` is not exposed by the API, so USAGE only lets SQL that
-- already runs inside the database find these functions by name. The two remaining private
-- functions that still had the default PUBLIC EXECUTE lose it, so the two helpers above are the
-- only private functions anon/authenticated can call. Triggers do not need EXECUTE to fire, and
-- refresh_workshop_rating_rollup() is only called by its SECURITY DEFINER trigger.
grant usage on schema private to anon, authenticated, service_role;
revoke all on function private.refresh_workshop_rating_rollup(text) from public;
revoke all on function private.handle_workshop_feedback_rating_rollup() from public;

CREATE OR REPLACE FUNCTION private.guard_workshop_host_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
declare
    v_role text := coalesce(auth.role(), '');
begin
    if v_role = ''
       or v_role = 'service_role'
       or pg_trigger_depth() > 1
       or private.user_has_role('admin') then
        return new;
    end if;

    if tg_op = 'INSERT' then
        new.approval_status := 'pending';
        new.seats_remaining := new.max_seats;
        new.rating := 0;
        new.review_count := 0;
        new.host_id := null; -- re-derived from host_user_id by sync_workshop_host_id
        return new;
    end if;

    if new.approval_status is distinct from old.approval_status
       or new.price is distinct from old.price
       or new.seats_remaining is distinct from old.seats_remaining
       or new.max_seats is distinct from old.max_seats
       or new.rating is distinct from old.rating
       or new.review_count is distinct from old.review_count
       or new.host_id is distinct from old.host_id
       or new.created_by is distinct from old.created_by then
        raise exception 'WORKSHOP_RESTRICTED_COLUMNS'
            using errcode = '42501',
                  hint = 'approval_status, price, seats, rating and ownership can only be changed by an admin or the server.';
    end if;

    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_workshop_feedback_moderation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
declare
    v_role text := coalesce(auth.role(), '');
begin
    if v_role = ''
       or v_role = 'service_role'
       or pg_trigger_depth() > 1
       or private.user_has_role('admin') then
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
$function$;

-- ---------------------------------------------------------------------------
-- 2. One permissive policy per table, role and action (lint 0006_multiple_permissive_policies)
-- ---------------------------------------------------------------------------
-- Each table had an admin FOR ALL policy (mostly TO public) next to its own read/insert rules,
-- so Postgres evaluated both on every query. Now: one SELECT policy that ORs the old ones, one
-- INSERT, UPDATE and DELETE policy each, all scoped to the API roles. Admins are always signed
-- in, so admin-only actions are TO authenticated; anon had no way through them before either.

-- communities
drop policy if exists communities_admin_manage on public.communities;
drop policy if exists communities_select_public on public.communities;
create policy communities_select on public.communities
    for select to anon, authenticated
    using (true);
create policy communities_insert on public.communities
    for insert to authenticated
    with check ((select private.user_has_role('admin')));
create policy communities_update on public.communities
    for update to authenticated
    using ((select private.user_has_role('admin')))
    with check ((select private.user_has_role('admin')));
create policy communities_delete on public.communities
    for delete to authenticated
    using ((select private.user_has_role('admin')));

-- community_photos
drop policy if exists community_photos_admin_manage on public.community_photos;
drop policy if exists community_photos_select_active on public.community_photos;
create policy community_photos_select on public.community_photos
    for select to anon, authenticated
    using (is_active = true or (select private.user_has_role('admin')));
create policy community_photos_insert on public.community_photos
    for insert to authenticated
    with check ((select private.user_has_role('admin')));
create policy community_photos_update on public.community_photos
    for update to authenticated
    using ((select private.user_has_role('admin')))
    with check ((select private.user_has_role('admin')));
create policy community_photos_delete on public.community_photos
    for delete to authenticated
    using ((select private.user_has_role('admin')));

-- host_applications
drop policy if exists host_applications_admin_manage on public.host_applications;
drop policy if exists host_applications_insert_own on public.host_applications;
drop policy if exists host_applications_select_own on public.host_applications;
create policy host_applications_select on public.host_applications
    for select to authenticated
    using ((select auth.uid()) = user_id or (select private.user_has_role('admin')));
create policy host_applications_insert on public.host_applications
    for insert to authenticated
    with check ((select auth.uid()) = user_id or (select private.user_has_role('admin')));
create policy host_applications_update on public.host_applications
    for update to authenticated
    using ((select private.user_has_role('admin')))
    with check ((select private.user_has_role('admin')));
create policy host_applications_delete on public.host_applications
    for delete to authenticated
    using ((select private.user_has_role('admin')));

-- host_earnings
drop policy if exists host_earnings_admin_manage on public.host_earnings;
drop policy if exists host_earnings_select_own on public.host_earnings;
create policy host_earnings_select on public.host_earnings
    for select to authenticated
    using (exists (select 1 from public.hosts h where h.id = host_earnings.host_id and h.user_id = (select auth.uid())) or (select private.user_has_role('admin')));
create policy host_earnings_insert on public.host_earnings
    for insert to authenticated
    with check ((select private.user_has_role('admin')));
create policy host_earnings_update on public.host_earnings
    for update to authenticated
    using ((select private.user_has_role('admin')))
    with check ((select private.user_has_role('admin')));
create policy host_earnings_delete on public.host_earnings
    for delete to authenticated
    using ((select private.user_has_role('admin')));

-- payouts
drop policy if exists payouts_admin_manage on public.payouts;
drop policy if exists payouts_select_own on public.payouts;
create policy payouts_select on public.payouts
    for select to authenticated
    using (exists (select 1 from public.hosts h where h.id = payouts.host_id and h.user_id = (select auth.uid())) or (select private.user_has_role('admin')));
create policy payouts_insert on public.payouts
    for insert to authenticated
    with check ((select private.user_has_role('admin')));
create policy payouts_update on public.payouts
    for update to authenticated
    using ((select private.user_has_role('admin')))
    with check ((select private.user_has_role('admin')));
create policy payouts_delete on public.payouts
    for delete to authenticated
    using ((select private.user_has_role('admin')));

-- platform_settings
drop policy if exists platform_settings_admin_manage on public.platform_settings;
drop policy if exists platform_settings_select_public on public.platform_settings;
create policy platform_settings_select on public.platform_settings
    for select to anon, authenticated
    using (true);
create policy platform_settings_insert on public.platform_settings
    for insert to authenticated
    with check ((select private.user_has_role('admin')));
create policy platform_settings_update on public.platform_settings
    for update to authenticated
    using ((select private.user_has_role('admin')))
    with check ((select private.user_has_role('admin')));
create policy platform_settings_delete on public.platform_settings
    for delete to authenticated
    using ((select private.user_has_role('admin')));

-- support_ticket_replies
drop policy if exists support_ticket_replies_admin_manage on public.support_ticket_replies;
drop policy if exists support_ticket_replies_insert_own_ticket on public.support_ticket_replies;
drop policy if exists support_ticket_replies_select_own_ticket on public.support_ticket_replies;
create policy support_ticket_replies_select on public.support_ticket_replies
    for select to authenticated
    using (exists (select 1 from public.support_tickets as ticket where ticket.id = support_ticket_replies.ticket_id and ticket.user_id = (select auth.uid())) or (select private.user_has_role('admin')));
create policy support_ticket_replies_insert on public.support_ticket_replies
    for insert to authenticated
    with check ((author_role = 'user' and author_user_id = (select auth.uid()) and exists (select 1 from public.support_tickets as ticket where ticket.id = support_ticket_replies.ticket_id and ticket.user_id = (select auth.uid()))) or (select private.user_has_role('admin')));
create policy support_ticket_replies_update on public.support_ticket_replies
    for update to authenticated
    using ((select private.user_has_role('admin')))
    with check ((select private.user_has_role('admin')));
create policy support_ticket_replies_delete on public.support_ticket_replies
    for delete to authenticated
    using ((select private.user_has_role('admin')));

-- support_tickets
drop policy if exists support_tickets_admin_manage on public.support_tickets;
drop policy if exists support_tickets_select_own on public.support_tickets;
create policy support_tickets_select on public.support_tickets
    for select to authenticated
    using ((select auth.uid()) = user_id or (select private.user_has_role('admin')));
create policy support_tickets_insert on public.support_tickets
    for insert to authenticated
    with check ((select private.user_has_role('admin')));
create policy support_tickets_update on public.support_tickets
    for update to authenticated
    using ((select private.user_has_role('admin')))
    with check ((select private.user_has_role('admin')));
create policy support_tickets_delete on public.support_tickets
    for delete to authenticated
    using ((select private.user_has_role('admin')));
