-- Store real workshop rating summaries instead of hardcoding client-facing ratings.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

alter table public.workshops
    add column if not exists rating numeric(2, 1) not null default 0 check (rating >= 0 and rating <= 5),
    add column if not exists review_count integer not null default 0 check (review_count >= 0);

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
            ),
            0
        ),
        review_count = coalesce(
            (
                select count(*)::integer
                from public.workshop_feedback as feedback
                where feedback.workshop_id = p_workshop_id
                  and feedback.rating is not null
            ),
            0
        ),
        updated_at = now()
    where id = p_workshop_id;
end;
$$;

create or replace function private.handle_workshop_feedback_rating_rollup()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
    if tg_op = 'DELETE' then
        perform private.refresh_workshop_rating_rollup(old.workshop_id);
        return old;
    end if;

    if tg_op = 'UPDATE' and old.workshop_id is distinct from new.workshop_id then
        perform private.refresh_workshop_rating_rollup(old.workshop_id);
    end if;

    perform private.refresh_workshop_rating_rollup(new.workshop_id);
    return new;
end;
$$;

drop trigger if exists refresh_workshop_rating_after_feedback on public.workshop_feedback;
create trigger refresh_workshop_rating_after_feedback
after insert or update or delete on public.workshop_feedback
for each row
execute function private.handle_workshop_feedback_rating_rollup();

update public.workshops
set rating = 0,
    review_count = 0;

update public.workshops as workshop
set
    rating = rating_summary.rating,
    review_count = rating_summary.review_count
from (
    select
        feedback.workshop_id,
        round(avg(feedback.rating)::numeric, 1) as rating,
        count(*)::integer as review_count
    from public.workshop_feedback as feedback
    where feedback.rating is not null
    group by feedback.workshop_id
) as rating_summary
where workshop.id = rating_summary.workshop_id;
