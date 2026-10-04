-- email_delivery_logs: make "server only" explicit.
--
-- The Supabase advisor flags this table as "RLS Enabled No Policy". That state already denied
-- every client: only the service role touches the table (src/lib/email.ts and the email cron,
-- both via createSupabaseServiceClient), and the service role bypasses RLS. The lint is about
-- intent, not a leak. This states the intent so the next reader -- and the advisor -- does not
-- have to infer it: no browser role may read or write delivery logs (they hold recipient
-- addresses and booking references).

drop policy if exists email_delivery_logs_no_client_access on public.email_delivery_logs;

create policy email_delivery_logs_no_client_access
on public.email_delivery_logs
for all
to anon, authenticated
using (false)
with check (false);

-- Defence in depth: without table privileges a client cannot reach the rows even if a
-- permissive policy is added here by mistake later.
revoke all on table public.email_delivery_logs from anon, authenticated;
