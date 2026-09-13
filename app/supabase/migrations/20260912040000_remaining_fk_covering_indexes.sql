-- Cover the remaining foreign keys the database linter flagged.
--
-- These are colder paths than the booking hot path covered by 20260912020000, but an
-- uncovered foreign key also forces every parent-row DELETE/UPDATE to scan the child table,
-- so they are worth having in place before the tables grow rather than after.
create index if not exists idx_community_photos_created_by
    on public.community_photos (created_by);

create index if not exists idx_coupon_redemptions_booking_id
    on public.coupon_redemptions (booking_id);

create index if not exists idx_coupon_redemptions_coupon_id
    on public.coupon_redemptions (coupon_id);

create index if not exists idx_coupon_redemptions_user_id
    on public.coupon_redemptions (user_id);

create index if not exists idx_coupons_created_by
    on public.coupons (created_by);

create index if not exists idx_workshop_feedback_moderated_by
    on public.workshop_feedback (moderated_by);

create index if not exists idx_workshops_created_by
    on public.workshops (created_by);

-- host_id is joined on every host earnings/payout lookup and by the host RLS policies.
create index if not exists idx_workshops_host_id
    on public.workshops (host_id);
