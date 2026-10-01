-- Coupon integrity.
--
-- 1. coupons.applicable_workshop_ids was created as uuid[], but workshops.id is TEXT.
--    confirm_booking_from_hold evaluates `p_workshop_id = any(v_coupon.applicable_workshop_ids)`
--    (text = uuid), which fails with "operator does not exist: text = uuid" for ANY coupon
--    that reaches that branch -- i.e. after the card was captured. The column has to be text[].
--    Nothing else depends on the column: no view, index, policy or generated column references
--    it, and plpgsql function bodies are not tracked as dependencies, so the ALTER succeeds.
--    (Sessions that already ran the old function body may hold a cached plan typed uuid[]; the
--    confirm_booking_from_hold migrations that follow this one `create or replace` the
--    function, which invalidates every backend's cache.)
-- 2. Sane bounds on the discount value. Added only if existing rows already satisfy them.
-- 3. One redemption per booking. The RPC inserts a redemption in the same transaction as the
--    booking, so a second row for one booking can only be a replay.

-- ---------------------------------------------------------------------------
-- 1. uuid[] -> text[]
-- ---------------------------------------------------------------------------

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'coupons'
          and column_name = 'applicable_workshop_ids'
          and udt_name = '_uuid'
    ) then
        alter table public.coupons
            alter column applicable_workshop_ids type text[]
            using applicable_workshop_ids::text[];
    end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. discount_value bounds
-- ---------------------------------------------------------------------------

-- A NOT VALID check is still enforced on every later UPDATE of an offending row (including
-- the used_count bump at redemption, and an admin deactivating it), which would make a legacy
-- bad coupon impossible to touch. So this adds the constraint only when the data is clean and
-- otherwise leaves it out with a warning, rather than half-applying it.
do $$
declare
    v_bad_positive integer;
    v_bad_percentage integer;
begin
    select count(*) into v_bad_positive
    from public.coupons
    where discount_value is null or discount_value <= 0;

    select count(*) into v_bad_percentage
    from public.coupons
    where discount_type = 'percentage' and discount_value > 100;

    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.coupons'::regclass
          and conname = 'coupons_discount_value_positive'
    ) then
        if v_bad_positive = 0 then
            alter table public.coupons
                add constraint coupons_discount_value_positive
                check (discount_value > 0);
        else
            raise warning
                'coupons_discount_value_positive NOT added: % coupon(s) have discount_value <= 0. Fix them, then: alter table public.coupons add constraint coupons_discount_value_positive check (discount_value > 0);',
                v_bad_positive;
        end if;
    end if;

    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.coupons'::regclass
          and conname = 'coupons_percentage_max_100'
    ) then
        if v_bad_percentage = 0 then
            alter table public.coupons
                add constraint coupons_percentage_max_100
                check (discount_type <> 'percentage' or discount_value <= 100);
        else
            raise warning
                'coupons_percentage_max_100 NOT added: % percentage coupon(s) exceed 100. Fix them, then: alter table public.coupons add constraint coupons_percentage_max_100 check (discount_type <> ''percentage'' or discount_value <= 100);',
                v_bad_percentage;
        end if;
    end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. One redemption per booking
-- ---------------------------------------------------------------------------

-- Keeps the earliest redemption of each booking and deletes later replays. NOTE: this does not
-- touch coupons.used_count; if replays existed the counter was over-counted by the same amount.
delete from public.coupon_redemptions as r
using (
    select id,
           row_number() over (
               partition by booking_id
               order by created_at asc nulls last, id
           ) as rn
    from public.coupon_redemptions
    where booking_id is not null
) as d
where r.id = d.id
  and d.rn > 1;

-- Rows whose booking_id is NULL (booking removed, see the FK migration) never conflict:
-- NULLs are distinct in a unique index.
create unique index if not exists uq_coupon_redemptions_booking_id
    on public.coupon_redemptions (booking_id);
