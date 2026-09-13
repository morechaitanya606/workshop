-- Confirm bookings with coupon totals and redemption accounting in one transaction.

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

create or replace function public.confirm_booking_from_hold(
    p_hold_id uuid,
    p_user_id uuid,
    p_workshop_id text,
    p_payment_provider text,
    p_payment_intent_id text,
    p_first_name text,
    p_last_name text,
    p_email text,
    p_phone text default null,
    p_notes text default null,
    p_service_fee integer default 99,
    p_subtotal integer default null,
    p_total integer default null,
    p_coupon_id uuid default null,
    p_discount_applied integer default 0
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_hold public.booking_holds%rowtype;
    v_workshop public.workshops%rowtype;
    v_coupon public.coupons%rowtype;
    v_original_subtotal integer;
    v_service_fee integer := greatest(coalesce(p_service_fee, 0), 0);
    v_expected_discount integer := 0;
    v_requested_discount integer := greatest(coalesce(p_discount_applied, 0), 0);
    v_subtotal integer;
    v_total integer;
    v_booking_id uuid;
begin
    select * into v_hold
    from public.booking_holds
    where id = p_hold_id
      and user_id = p_user_id
      and workshop_id = p_workshop_id
    for update;

    if not found then
        raise exception 'HOLD_NOT_FOUND';
    end if;

    if v_hold.status <> 'active' then
        raise exception 'HOLD_NOT_ACTIVE';
    end if;

    if v_hold.expires_at < now() then
        update public.booking_holds
        set status = 'expired'
        where id = v_hold.id;
        raise exception 'HOLD_EXPIRED';
    end if;

    select * into v_workshop
    from public.workshops
    where id = p_workshop_id
    for update;

    if not found then
        raise exception 'WORKSHOP_NOT_FOUND';
    end if;

    if v_workshop.seats_remaining < v_hold.guests then
        raise exception 'SEATS_UNAVAILABLE';
    end if;

    v_original_subtotal := greatest(coalesce(v_workshop.price, 0), 0) * v_hold.guests;

    if p_coupon_id is not null then
        select * into v_coupon
        from public.coupons
        where id = p_coupon_id
        for update;

        if not found then
            raise exception 'COUPON_NOT_FOUND';
        end if;

        if not coalesce(v_coupon.is_active, false) then
            raise exception 'COUPON_INACTIVE';
        end if;

        if v_coupon.valid_from is not null and v_coupon.valid_from > now() then
            raise exception 'COUPON_NOT_YET_VALID';
        end if;

        if v_coupon.valid_until is not null and v_coupon.valid_until < now() then
            raise exception 'COUPON_EXPIRED';
        end if;

        if v_coupon.max_uses is not null and coalesce(v_coupon.used_count, 0) >= v_coupon.max_uses then
            raise exception 'COUPON_MAX_USES_REACHED';
        end if;

        if v_coupon.min_order_amount is not null and v_original_subtotal < v_coupon.min_order_amount then
            raise exception 'COUPON_MIN_ORDER_NOT_MET';
        end if;

        if array_length(v_coupon.applicable_workshop_ids, 1) > 0
           and not (p_workshop_id = any(v_coupon.applicable_workshop_ids)) then
            raise exception 'COUPON_WORKSHOP_MISMATCH';
        end if;

        if array_length(v_coupon.applicable_categories, 1) > 0
           and not (v_workshop.category = any(v_coupon.applicable_categories)) then
            raise exception 'COUPON_CATEGORY_MISMATCH';
        end if;

        if v_coupon.discount_type = 'percentage' then
            v_expected_discount := round(
                (v_original_subtotal::numeric * greatest(coalesce(v_coupon.discount_value, 0), 0)::numeric) / 100
            )::integer;
        elsif v_coupon.discount_type = 'fixed' then
            v_expected_discount := greatest(coalesce(v_coupon.discount_value, 0), 0);
        else
            raise exception 'COUPON_DISCOUNT_TYPE_INVALID';
        end if;

        v_expected_discount := least(v_original_subtotal, greatest(v_expected_discount, 0));

        if v_requested_discount <> v_expected_discount then
            raise exception 'COUPON_DISCOUNT_MISMATCH';
        end if;
    elsif v_requested_discount <> 0 then
        raise exception 'DISCOUNT_WITHOUT_COUPON';
    end if;

    v_subtotal := coalesce(p_subtotal, v_original_subtotal - v_expected_discount);
    v_total := coalesce(p_total, v_subtotal + v_service_fee);

    if v_subtotal <> v_original_subtotal - v_expected_discount then
        raise exception 'BOOKING_SUBTOTAL_MISMATCH';
    end if;

    if v_total <> v_subtotal + v_service_fee then
        raise exception 'BOOKING_TOTAL_MISMATCH';
    end if;

    update public.workshops
    set seats_remaining = seats_remaining - v_hold.guests
    where id = p_workshop_id;

    insert into public.bookings (
        user_id,
        workshop_id,
        hold_id,
        guests,
        subtotal,
        service_fee,
        total,
        payment_provider,
        payment_intent_id,
        first_name,
        last_name,
        email,
        phone,
        notes,
        status
    ) values (
        p_user_id,
        p_workshop_id,
        p_hold_id,
        v_hold.guests,
        v_subtotal,
        v_service_fee,
        v_total,
        p_payment_provider,
        p_payment_intent_id,
        p_first_name,
        p_last_name,
        p_email,
        p_phone,
        p_notes,
        'confirmed'
    )
    returning id into v_booking_id;

    if p_coupon_id is not null then
        update public.coupons
        set used_count = coalesce(used_count, 0) + 1
        where id = p_coupon_id;

        insert into public.coupon_redemptions (
            booking_id,
            coupon_id,
            user_id,
            discount_applied
        ) values (
            v_booking_id,
            p_coupon_id,
            p_user_id,
            v_expected_discount
        );
    end if;

    update public.booking_holds
    set status = 'confirmed'
    where id = p_hold_id;

    return v_booking_id;
end;
$$;

revoke all on function public.confirm_booking_from_hold(
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
    integer,
    integer,
    integer,
    uuid,
    integer
) from public, anon, authenticated;

grant execute on function public.confirm_booking_from_hold(
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
    integer,
    integer,
    integer,
    uuid,
    integer
) to service_role;
