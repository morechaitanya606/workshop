-- Atomic host payouts.
--
-- /api/admin/payouts did SELECT available earnings -> INSERT payout -> UPDATE earnings to
-- 'paid' as three separate requests. Two admins (or one double-click) both read the same
-- 'available' rows and each inserted a payout, so the host was paid twice for the same
-- money; and a failure between the insert and the update left a recorded payout with the
-- earnings still 'available', to be paid out again on the next run.
--
-- create_host_payout does all of it in ONE transaction: it locks the host's available
-- earnings, inserts the payout from the locked sum and marks exactly those rows paid. A
-- concurrent call blocks on the row locks and then finds nothing left to pay.

alter table public.host_earnings
    add column if not exists payout_id uuid references public.payouts (id) on delete set null;

alter table public.payouts
    add column if not exists created_by uuid references auth.users (id) on delete set null;

create index if not exists idx_host_earnings_payout_id
    on public.host_earnings (payout_id)
    where payout_id is not null;

create or replace function public.create_host_payout(
    p_host_id uuid,
    p_note text default null,
    p_admin uuid default null
)
returns table (
    payout_id uuid,
    amount numeric,
    earnings_count integer
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
    v_ids uuid[];
    v_total numeric;
    v_payout_id uuid;
begin
    perform public.assert_service_role();

    if p_host_id is null then
        raise exception 'INVALID_HOST';
    end if;

    -- FOR UPDATE inside the subquery: an aggregate cannot carry the lock clause itself, but
    -- the rows it reads are locked all the same until this transaction ends.
    select array_agg(locked.id), coalesce(sum(locked.amount), 0)
    into v_ids, v_total
    from (
        select e.id, e.amount
        from public.host_earnings as e
        where e.host_id = p_host_id
          and e.status = 'available'
        order by e.id
        for update
    ) as locked;

    -- Nothing to pay (or only zero-value rows, which payouts.amount > 0 rejects): return no
    -- rows and leave every earning exactly as it was.
    if v_ids is null or v_total <= 0 then
        return;
    end if;

    insert into public.payouts (host_id, amount, status, reference_note, created_by)
    values (
        p_host_id,
        v_total,
        'completed',
        coalesce(nullif(btrim(p_note), ''), 'Manual payout'),
        p_admin
    )
    returning id into v_payout_id;

    update public.host_earnings as e
    set status = 'paid',
        payout_id = v_payout_id
    where e.id = any (v_ids);

    return query select v_payout_id, v_total, coalesce(array_length(v_ids, 1), 0);
end;
$$;

revoke all on function public.create_host_payout(uuid, text, uuid)
from public, anon, authenticated;

grant execute on function public.create_host_payout(uuid, text, uuid)
to service_role;
