-- Lock down the public `uploads` bucket.
--
-- 20260912171240_profile_and_upload_storage.sql let any authenticated user INSERT/UPDATE/DELETE
-- in storage.objects directly (PostgREST-style, with their own JWT), which bypasses everything
-- /api/upload enforces: magic-byte sniffing, SVG blocking, image re-encode to WebP, per-user
-- byte quotas and rate limits. The bucket also had no size or MIME limit, and the anonymous
-- SELECT policy allowed `POST /storage/v1/object/list/uploads`, enumerating every user's files.
--
-- Verified in src: the only code that touches Storage is src/app/api/upload/route.ts, via the
-- service-role client (which bypasses RLS). The browser Supabase client (src/lib/supabase.ts)
-- is used for auth only. So no end-user policy is needed on this bucket.
--
-- Public URLs (/storage/v1/object/public/uploads/<path>) do not go through RLS for a public
-- bucket, so removing the SELECT policy removes listing without breaking any existing image or
-- video URL. It does mean anon/authenticated can no longer download via the authenticated
-- endpoint or list; use the public URL.

-- Defence in depth: even a service-role upload cannot exceed these. The list matches what
-- /api/upload can produce (images are re-encoded to WebP; videos are mp4/webm/mov/m4v).
update storage.buckets
set
    file_size_limit = 52428800, -- 50 MB
    allowed_mime_types = array[
        'image/webp',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/avif',
        'video/mp4',
        'video/webm',
        'video/quicktime',
        'video/x-m4v'
    ]
where id = 'uploads';

-- Drop by name AND by content: the live database has drifted from the repo before (see the
-- coupons policy in 20260912171456_production_lockdown.sql), and a name-only DROP silently
-- no-ops on a renamed policy. Only policies that reference the `uploads` bucket are touched;
-- the `media` bucket policies are left alone.
drop policy if exists "Public uploads are viewable by everyone" on storage.objects;
drop policy if exists "Authenticated users can upload into their own uploads folder" on storage.objects;
drop policy if exists "Authenticated users can update their own uploads" on storage.objects;
drop policy if exists "Authenticated users can delete their own uploads" on storage.objects;

do $$
declare
    p record;
begin
    for p in
        select policyname
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and (coalesce(qual, '') like '%''uploads''%' or coalesce(with_check, '') like '%''uploads''%')
    loop
        execute format('drop policy if exists %I on storage.objects', p.policyname);
    end loop;
end;
$$;
