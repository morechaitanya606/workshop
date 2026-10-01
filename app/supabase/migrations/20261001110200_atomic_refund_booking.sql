-- Atomic booking refund.
--
-- The Razorpay webhook handled a full refund as four independent writes: flip the booking to
-- 'refunded', reverse the host's earning, restore seats per booking, notify. Each write's
-- error was dropped, so:
--   * a failed seat restore after the status flip lost the seats for good (the retry no
--     longer saw a 'confirmed' booking to restore), and
--   * two refund events for one payment both read the booking as 'confirmed', both flipped
--     it and both restored its seats, inflating inventory.
--
-- refund_booking does the whole thing in ONE transaction and is driven by the conditional
-- UPDATE ... WHERE status = 'confirmed' RETURNING: only the caller that actually performs
-- the confirmed -> refunded transition gets rows back, so seats are restored exactly once
-- and an error anywhere rolls the status flip back, leaving the event retryable.

create or replace function public.refund_booking(p_payment_id text)
returns table (
    booking_id uuid,
    workshop_id text,
    guests integer,
    earning_was_paid boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
    v_row record;
    v_earning_status public.earning_status;
begin
    perform public.assert_service_role();

    if p_payment_id is null or btrim(p_payment_id) = '' then
        raise exception 'INVALID_PAYMENT_ID';
    end if;

    for v_row in
        update public.bookings as b
        set status = 'refunded'
        where b.payment_intent_id = p_payment_id
          and b.status = 'confirmed'
        returning b.id as id, b.workshop_id as workshop_id, b.guests as guests
    loop
        -- Reset per row: SELECT INTO leaves the target untouched when nothing matches, so a
        -- booking with no earnings row would otherwise inherit the previous row's status.
        v_earning_status := null;

        -- Host credit comes out before seats go back in. A row already paid out is left
        -- alone and reported to the caller: that is a clawback for a human, and zeroing a
        -- paid row would hide it.
        select e.status
        into v_earning_status
        from public.host_earnings as e
        where e.booking_id = v_row.id
        for update;

        if found and v_earning_status <> 'paid' then
            update public.host_earnings as e
            set amount = 0,
                fee_deducted = 0,
                status = 'pending'
            where e.booking_id = v_row.id
              and e.status <> 'paid';
        end if;

        -- Relative, clamped to max_seats and raising WORKSHOP_NOT_FOUND: any failure here
        -- aborts the whole function, including the status flip above.
        if coalesce(v_row.guests, 0) > 0 then
            perform public.restore_workshop_seats(v_row.workshop_id, v_row.guests);
        end if;

        -- RETURN QUERY rather than assigning the OUT columns + RETURN NEXT: same result in
        -- Postgres, but libpg_query (npm run db:validate) does not register RETURNS TABLE
        -- columns as OUT params and rejects a bare RETURN NEXT.
        return query
        select v_row.id, v_row.workshop_id, v_row.guests,
               coalesce(v_earning_status = 'paid', false);
    end loop;

    return;
end;
$$;

revoke all on function public.refund_booking(text)
from public, anon, authenticated;

grant execute on function public.refund_booking(text)
to service_role;
