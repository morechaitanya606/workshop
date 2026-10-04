-- Supabase advisor fixes (2026-10-04) that do not change who may read or write what.
--
-- Deliberately NOT here, because they rewrite access rules on a live database that has no
-- staging copy to test against first:
--   * multiple_permissive_policies (8 tables): merging each table's admin + owner policies.
--   * anon/authenticated_security_definer_function_executable: user_has_role() and
--     client_owned_by_current_user() back many RLS policies, so revoking EXECUTE would break
--     every query on those tables, and moving them out of `public` breaks the two private
--     guard functions that call them by name. Both only report on the caller's own role.

-- ---------------------------------------------------------------------------
-- 1. Extensions out of the API-exposed `public` schema (lint 0014_extension_in_public)
-- ---------------------------------------------------------------------------
-- Both extensions are relocatable. Columns, indexes (the HNSW index on faq.embedding, the
-- gin_trgm_ops search indexes) and function signatures refer to their types and operators by
-- OID, so they keep working. What does NOT follow is name lookup inside function bodies:
-- match_faqs uses `<=>` with search_path = public, so it is redefined below to also search
-- `extensions`. No other live function body uses a vector or trigram operator.
create schema if not exists extensions;

alter extension pg_trgm set schema extensions;
alter extension vector set schema extensions;

create or replace function public.match_faqs(
    p_client_id uuid,
    p_query_embedding extensions.vector(768),
    p_match_count integer default 3
)
returns table (
    id uuid,
    client_id uuid,
    question text,
    answer text,
    similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
    select
        faq.id,
        faq.client_id,
        faq.question,
        faq.answer,
        1 - (faq.embedding <=> p_query_embedding) as similarity
    from public.faq
    where faq.client_id = p_client_id
      and faq.embedding is not null
    order by faq.embedding <=> p_query_embedding
    limit greatest(coalesce(p_match_count, 3), 1);
$$;

-- ---------------------------------------------------------------------------
-- 2. Public bucket allows listing (lint 0025_public_bucket_allows_listing)
-- ---------------------------------------------------------------------------
-- `media` is a public bucket: files are served by their public URL without any SELECT policy.
-- This policy only added the ability to LIST every file in the bucket through the API. The app
-- never lists it (the hero videos are served from app/public/videos), and writes stay
-- service-role only.
drop policy if exists "Public media is viewable by everyone" on storage.objects;

-- ---------------------------------------------------------------------------
-- 3. Unindexed foreign key (lint 0001_unindexed_foreign_keys)
-- ---------------------------------------------------------------------------
-- payouts.created_by -> auth.users ON DELETE SET NULL: deleting a user scans payouts without it.
create index if not exists idx_payouts_created_by on public.payouts (created_by);
