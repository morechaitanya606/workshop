-- Wrap auth.uid()/auth.role()/auth.jwt() in RLS policies as (select auth.x()).
--
-- Postgres evaluates a bare auth.uid() in a policy predicate once PER ROW; wrapping it in a
-- scalar subquery lets the planner hoist it into an InitPlan evaluated once per statement.
-- On a table with a handful of rows this is invisible; on bookings or workshops at launch
-- scale it is the difference between one auth lookup and one per row scanned. This is
-- Supabase's documented remediation for the `auth_rls_initplan` linter warning, which fired
-- on 42 policies across 19 tables.
--
-- The transformation is semantics-preserving: these functions are stable and take no
-- arguments, so hoisting them cannot change the predicate's result.
--
-- Policies are regenerated from pg_policies rather than hand-transcribed, so cmd, roles,
-- permissive/restrictive, USING and WITH CHECK all carry over exactly -- there is no
-- opportunity to fat-finger an access-control rule. The whole migration is one transaction:
-- if any single policy fails to recreate, everything rolls back and the prior policies
-- stand. A partial failure would therefore fail CLOSED, never open.
--
-- Verified after applying: 71 policies before and after, 0 missing/extra, 0 drift in
-- permissive/cmd/roles, 0 semantic drift once the (select ...) wrapper is normalised away,
-- and 0 policies left unwrapped. An anonymous-role probe returned the same row counts as
-- before the change (0 rows on coupons/bookings/booking_holds/profiles/host_earnings/
-- support_tickets/waitlists/user_favorites; 7 on the deliberately public workshops table).
do $$
declare
    p record;
    v_using text;
    v_check text;
    v_sql   text;
    v_count integer := 0;
begin
    for p in
        -- Materialise first: we are about to modify the very catalog we are reading.
        select * from (
            select tablename, policyname, permissive, cmd, roles, qual, with_check
            from pg_policies
            where schemaname = 'public'
              and (qual ~* 'auth\.(uid|role|jwt)\(\)' or with_check ~* 'auth\.(uid|role|jwt)\(\)')
              -- Case-insensitive, so an already-wrapped policy is skipped rather than
              -- double-wrapped on a re-run. This makes the migration idempotent.
              and coalesce(qual, '')       !~* '\(\s*select\s+auth\.'
              and coalesce(with_check, '') !~* '\(\s*select\s+auth\.'
        ) snap
    loop
        v_using := case when p.qual is null then null
                        else regexp_replace(p.qual, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'gi') end;
        v_check := case when p.with_check is null then null
                        else regexp_replace(p.with_check, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'gi') end;

        execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);

        v_sql := format('create policy %I on public.%I as %s for %s to %s',
                        p.policyname,
                        p.tablename,
                        case when p.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
                        lower(p.cmd),
                        array_to_string(p.roles, ', '));

        if v_using is not null then
            v_sql := v_sql || format(' using (%s)', v_using);
        end if;
        if v_check is not null then
            v_sql := v_sql || format(' with check (%s)', v_check);
        end if;

        execute v_sql;
        v_count := v_count + 1;
    end loop;

    raise notice 'rewrote % policies', v_count;
end;
$$;
