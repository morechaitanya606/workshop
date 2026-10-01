-- Drop two RPCs nothing calls.
--
-- decrement_seats(uuid, int): written against workshops.id as UUID, but workshops.id is TEXT, so
--   it cannot match a single row (and `returns table(id uuid)` cannot return one). It was
--   superseded by confirm_booking_from_hold, which adjusts seats atomically inside the booking
--   transaction.
-- increment_coupon_usage(uuid): superseded by the used_count bump inside
--   confirm_booking_from_hold; calling it separately would double-count.
--
-- Verified: no call site in src (the only mention is a negative assertion in
-- src/app/api/bookings/checkout/route.test.ts) and no other SQL function references either.
-- Dropped by name across every overload so a drifted signature cannot survive.

do $$
declare
    fn record;
begin
    for fn in
        select p.oid::regprocedure as signature
        from pg_proc as p
        join pg_namespace as n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('decrement_seats', 'increment_coupon_usage')
    loop
        execute format('drop function if exists %s', fn.signature);
    end loop;
end;
$$;
