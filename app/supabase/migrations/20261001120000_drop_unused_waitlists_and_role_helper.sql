-- Drop database objects nothing uses any more.
--
-- public.waitlists + public.waitlist_status: the waitlist feature was removed (a sold-out
--   workshop now shows the WhatsApp community popup) and no route, function, policy or view
--   reads the table. bookings.attended, added by the same 20260912171219 migration, is live
--   (check-in) and stays.
-- public.user_has_any_role(text[]): no policy, function or app call uses it, and it was
--   callable by anon over /rpc.
--
-- The table is dropped only while it is EMPTY, so this migration can never delete a signup.
-- If it holds rows it is kept with a notice: export them, then drop it by hand.
-- No CASCADE anywhere: if production has drifted and something depends on these objects, the
-- drop fails loudly instead of silently taking the dependant with it.

do $$
declare
    v_rows bigint;
begin
    if to_regclass('public.waitlists') is null then
        return;
    end if;

    select count(*) into v_rows from public.waitlists;

    if v_rows > 0 then
        raise notice 'public.waitlists kept: it holds % row(s). Export them, then drop it by hand.',
            v_rows;
    else
        drop table public.waitlists;
    end if;
end;
$$;

-- The enum goes only once the table that uses it is gone.
do $$
begin
    if to_regclass('public.waitlists') is null
       and exists (
           select 1
           from pg_type as t
           join pg_namespace as n on n.oid = t.typnamespace
           where n.nspname = 'public'
             and t.typname = 'waitlist_status'
       ) then
        drop type public.waitlist_status;
    end if;
end;
$$;

drop function if exists public.user_has_any_role(text[]);
