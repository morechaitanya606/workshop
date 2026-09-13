-- Recovered from supabase_migrations.schema_migrations on the linked project.
--
-- This migration was applied directly to the database and its SQL never existed in the
-- repository, so the repo could not reproduce production. The body below is exactly what
-- the history table recorded as executed; it is checked in unchanged so the migration set
-- is complete. It is already applied -- do not re-run it by hand.

-- Public bucket for marketing media (hero video), kept separate from `uploads` so that
-- user-generated content and site assets have independent policies and lifecycles.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = excluded.public;

-- Readable by anyone (it is marketing video on the public homepage); writable only by the
-- service role, so no authenticated user can push files into the site's own asset bucket.
drop policy if exists "Public media is viewable by everyone" on storage.objects;
create policy "Public media is viewable by everyone"
on storage.objects
for select
using (bucket_id = 'media');

drop policy if exists "Only service role can write media" on storage.objects;
create policy "Only service role can write media"
on storage.objects
for insert
to service_role
with check (bucket_id = 'media');

drop policy if exists "Only service role can update media" on storage.objects;
create policy "Only service role can update media"
on storage.objects
for update
to service_role
using (bucket_id = 'media')
with check (bucket_id = 'media');
