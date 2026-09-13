-- Close the remaining SECURITY DEFINER routines that PostgREST exposed to anonymous
-- callers at /rest/v1/rpc/...
--
-- `handle_new_auth_user` is an auth.users trigger function and `rls_auto_enable` is a
-- maintenance routine. Neither belongs to the app's API surface, and neither should be
-- callable by an anonymous client holding only the publishable key.
--
-- `user_has_role`, `user_has_any_role` and `client_owned_by_current_user` are deliberately
-- left executable: they are referenced by RLS policies, they only ever report on the
-- caller's own identity, and Supabase's own conventions grant them.
do $$
declare
    fn record;
begin
    for fn in
        select p.oid::regprocedure as signature
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('handle_new_auth_user', 'rls_auto_enable')
    loop
        execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
    end loop;
end;
$$;
