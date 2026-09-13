-- Align coupon and platform-setting policies with the app's admin role model.

alter table if exists public.coupons enable row level security;
alter table if exists public.coupon_redemptions enable row level security;
alter table if exists public.platform_settings enable row level security;

do $$
declare
    p record;
begin
    for p in
        select policyname, tablename
        from pg_policies
        where schemaname = 'public'
          and tablename = any (array['coupons', 'coupon_redemptions', 'platform_settings'])
    loop
        execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
    end loop;
end;
$$;

create policy coupons_select_active_or_admin
on public.coupons
for select
using (coalesce(is_active, false) or public.user_has_role('admin'));

create policy coupons_admin_manage
on public.coupons
for all
using (public.user_has_role('admin'))
with check (public.user_has_role('admin'));

create policy coupon_redemptions_select_own_or_admin
on public.coupon_redemptions
for select
using (auth.uid() = user_id or public.user_has_role('admin'));

create policy coupon_redemptions_insert_service_only
on public.coupon_redemptions
for insert
with check (auth.role() = 'service_role');

create policy coupon_redemptions_update_admin_or_service
on public.coupon_redemptions
for update
using (public.user_has_role('admin') or auth.role() = 'service_role')
with check (public.user_has_role('admin') or auth.role() = 'service_role');

create policy coupon_redemptions_delete_admin_only
on public.coupon_redemptions
for delete
using (public.user_has_role('admin'));

create policy platform_settings_select_public
on public.platform_settings
for select
using (true);

create policy platform_settings_admin_manage
on public.platform_settings
for all
using (public.user_has_role('admin'))
with check (public.user_has_role('admin'));
