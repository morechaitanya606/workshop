-- Foreign-key delete rules for the money trail.
--
-- BEFORE:
--   coupon_redemptions.user_id / booking_id / coupon_id and coupons.created_by had no ON DELETE
--   clause (NO ACTION), so deleting a user -> profiles row (auth.users cascades to profiles)
--   was blocked by any coupon they ever created or redeemed. Account deletion failed.
--   bookings.user_id was ON DELETE CASCADE: deleting an account silently destroyed every
--   booking the user ever paid for, and host_earnings.booking_id CASCADE then destroyed the
--   host's ledger rows for those bookings. Payment records must outlive the account: they are
--   needed for refunds, chargebacks, host payouts and tax records.
--   host_earnings.host_id / payouts.host_id CASCADE: deleting a hosts row wiped that host's
--   entire earnings and payout history.
--
-- AFTER (trade-offs in brackets):
--   coupon_redemptions.user_id/booking_id/coupon_id -> SET NULL. [The redemption row, with its
--       discount_applied amount, survives as an audit record even when the user/booking/coupon
--       is later removed; it just loses the link. Columns were already nullable.]
--   coupons.created_by -> SET NULL. [A coupon outlives the admin who made it.]
--   bookings.user_id -> SET NULL, column made NULLABLE. [The booking survives account deletion
--       with its own snapshot of name/email/phone (first_name, last_name, email, phone), which
--       is what refunds and receipts use. A booking with user_id NULL is no longer visible to
--       any user through RLS (auth.uid() = user_id is never true for NULL) -- only to admins,
--       the hosting host and the service role. Code that reads bookings.user_id must tolerate
--       NULL. If PII must also go on deletion, a separate anonymisation step has to blank those
--       snapshot columns; that is a policy decision, not made here.]
--   host_earnings.booking_id -> RESTRICT. [A booking with an earnings row can no longer be
--       deleted until someone deals with the ledger entry deliberately; previously the delete
--       silently removed the host's money. Nothing in src deletes bookings.]
--   host_earnings.host_id, payouts.host_id -> RESTRICT. [A host with any ledger/payout history
--       cannot be deleted; hosts.user_id is already ON DELETE SET NULL, so deleting the
--       host's login does not need to delete the hosts row. Nothing in src deletes hosts.]
--
-- Left alone on purpose: booking_holds.user_id CASCADE (a hold is a 15-minute reservation, not
-- a record), bookings.workshop_id RESTRICT (already correct), bookings.hold_id SET NULL.
--
-- The constraints are located by (table, column, referenced table), not by name, so a database
-- whose constraint names drifted still ends up correct. Re-adding a foreign key scans the child
-- table and takes SHARE ROW EXCLUSIVE on both tables briefly; these tables are small.
-- Idempotent: a constraint that already has the wanted rule is left alone.

alter table public.bookings
    alter column user_id drop not null;

do $$
declare
    spec record;
    v_con record;
    v_col_attnum smallint;
    v_name text;
begin
    for spec in
        select *
        from (values
            ('public', 'coupon_redemptions', 'user_id',    'public', 'profiles',   'id', 'n'),
            ('public', 'coupon_redemptions', 'booking_id', 'public', 'bookings',   'id', 'n'),
            ('public', 'coupon_redemptions', 'coupon_id',  'public', 'coupons',    'id', 'n'),
            ('public', 'coupons',             'created_by', 'public', 'profiles',   'id', 'n'),
            ('public', 'bookings',            'user_id',    'auth',   'users',      'id', 'n'),
            ('public', 'host_earnings',       'booking_id', 'public', 'bookings',   'id', 'r'),
            ('public', 'host_earnings',       'host_id',    'public', 'hosts',      'id', 'r'),
            ('public', 'payouts',             'host_id',    'public', 'hosts',      'id', 'r')
        ) as t(tbl_schema, tbl, col, ref_schema, ref_tbl, ref_col, rule)
    loop
        select a.attnum
        into v_col_attnum
        from pg_attribute as a
        where a.attrelid = format('%I.%I', spec.tbl_schema, spec.tbl)::regclass
          and a.attname = spec.col
          and not a.attisdropped;

        if v_col_attnum is null then
            raise notice 'skipping %.%: column % not found', spec.tbl_schema, spec.tbl, spec.col;
            continue;
        end if;

        select c.conname, c.confdeltype
        into v_con
        from pg_constraint as c
        where c.contype = 'f'
          and c.conrelid = format('%I.%I', spec.tbl_schema, spec.tbl)::regclass
          and c.confrelid = format('%I.%I', spec.ref_schema, spec.ref_tbl)::regclass
          and c.conkey = array[v_col_attnum];

        if found and v_con.confdeltype::text = spec.rule then
            continue;
        end if;

        v_name := coalesce(v_con.conname, spec.tbl || '_' || spec.col || '_fkey');

        if found then
            execute format('alter table %I.%I drop constraint %I', spec.tbl_schema, spec.tbl, v_name);
        end if;

        execute format(
            'alter table %I.%I add constraint %I foreign key (%I) references %I.%I (%I) on delete %s',
            spec.tbl_schema, spec.tbl, v_name, spec.col,
            spec.ref_schema, spec.ref_tbl, spec.ref_col,
            case spec.rule when 'n' then 'set null' else 'restrict' end
        );
    end loop;
end;
$$;
