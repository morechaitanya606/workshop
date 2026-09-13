-- Cover the foreign keys that sit on the booking hot path.
--
-- The database linter flagged these as unindexed. With only a handful of rows today it
-- makes no measurable difference, but every hold lookup, every booking-by-user read and
-- every cascade check degrades to a sequential scan as these tables grow -- and they grow
-- fastest during exactly the traffic spike where it hurts most.
create index if not exists idx_booking_holds_user_id
    on public.booking_holds (user_id);

create index if not exists idx_bookings_hold_id
    on public.bookings (hold_id)
    where hold_id is not null;

create index if not exists idx_bookings_user_id
    on public.bookings (user_id);
