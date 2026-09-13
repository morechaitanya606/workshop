-- Recovered from supabase_migrations.schema_migrations on the linked project.
--
-- This migration was applied directly to the database and its SQL never existed in the
-- repository, so the repo could not reproduce production. The body below is exactly what
-- the history table recorded as executed; it is checked in unchanged so the migration set
-- is complete. It is already applied -- do not re-run it by hand.

-- 20260606_coupon_usage_rpc_hardening.sql superseded the original 11-argument
-- confirm_booking_from_hold with a coupon-aware version, and 20260714193000 then
-- superseded that with the early-bird-aware 16-argument form applied next.
-- The intermediate 15-argument definition exists only between those two migrations, so
-- only its lasting effect is reproduced here: removing the legacy overload.
drop function if exists public.confirm_booking_from_hold(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    integer
);
