-- Reviews were published the instant an attendee submitted them: there was no approved/
-- published column on workshop_feedback and no admin gate. This adds one, and makes the
-- rating rollup count only published reviews so the public average cannot be moved by a
-- review that is still awaiting moderation.

-- New reviews land unpublished so the admin gate in /api/admin/feedback/[id] is the
-- thing that makes them public. Defaulting to true left the gate wired up but inert
-- for exactly the case it was built for.
alter table public.workshop_feedback
    add column if not exists is_published boolean not null default false,
    add column if not exists published_at timestamptz,
    add column if not exists moderated_by uuid references auth.users (id) on delete set null,
    add column if not exists moderated_at timestamptz;

-- Existing rows were already publicly visible; keep them that way rather than silently
-- retracting reviews that hosts and attendees have already seen. Only rows that predate
-- this migration are back-filled -- anything created afterwards goes through moderation.
update public.workshop_feedback
set is_published = true,
    published_at = coalesce(published_at, created_at)
where published_at is null;

create index if not exists idx_workshop_feedback_workshop_published
    on public.workshop_feedback (workshop_id, is_published, created_at desc);

-- Rating rollup must ignore unpublished reviews.
create or replace function private.refresh_workshop_rating_rollup(p_workshop_id text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
    update public.workshops
    set
        rating = coalesce(
            (
                select round(avg(feedback.rating)::numeric, 1)
                from public.workshop_feedback as feedback
                where feedback.workshop_id = p_workshop_id
                  and feedback.rating is not null
                  and feedback.is_published
            ),
            0
        ),
        review_count = coalesce(
            (
                select count(*)::integer
                from public.workshop_feedback as feedback
                where feedback.workshop_id = p_workshop_id
                  and feedback.rating is not null
                  and feedback.is_published
            ),
            0
        ),
        updated_at = now()
    where id = p_workshop_id;
end;
$$;

-- Recompute every rollup so existing counts match the new definition.
do $$
declare
    workshop_row record;
begin
    for workshop_row in select id from public.workshops loop
        perform private.refresh_workshop_rating_rollup(workshop_row.id);
    end loop;
end;
$$;
