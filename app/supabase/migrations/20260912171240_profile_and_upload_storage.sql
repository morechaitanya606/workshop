alter table public.profiles
    add column if not exists date_of_birth date,
    add column if not exists phone_number text;

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do update
set
    name = excluded.name,
    public = excluded.public;

drop policy if exists "Public uploads are viewable by everyone" on storage.objects;
create policy "Public uploads are viewable by everyone"
on storage.objects
for select
using (bucket_id = 'uploads');

drop policy if exists "Authenticated users can upload into their own uploads folder" on storage.objects;
create policy "Authenticated users can upload into their own uploads folder"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

drop policy if exists "Authenticated users can update their own uploads" on storage.objects;
create policy "Authenticated users can update their own uploads"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'uploads'
    and owner_id = (select auth.uid()::text)
)
with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

drop policy if exists "Authenticated users can delete their own uploads" on storage.objects;
create policy "Authenticated users can delete their own uploads"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'uploads'
    and owner_id = (select auth.uid()::text)
);
