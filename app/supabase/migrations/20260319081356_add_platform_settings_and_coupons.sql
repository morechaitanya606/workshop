-- Recovered from supabase_migrations.schema_migrations on the linked project.
--
-- This migration was applied directly to the database and its SQL never existed in the
-- repository, so the repo could not reproduce production. The body below is exactly what
-- the history table recorded as executed; it is checked in unchanged so the migration set
-- is complete. It is already applied -- do not re-run it by hand.

CREATE TABLE IF NOT EXISTS platform_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Initialize with default service fee
INSERT INTO platform_settings (setting_key, setting_value)
VALUES ('service_fee', '49'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS coupons (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text UNIQUE NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric NOT NULL,
  min_order_amount numeric DEFAULT 0,
  max_uses integer DEFAULT NULL,
  used_count integer DEFAULT 0,
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz DEFAULT NULL,
  applicable_workshop_ids uuid[] DEFAULT NULL,
  applicable_categories text[] DEFAULT NULL,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id uuid REFERENCES coupons(id),
  user_id uuid REFERENCES profiles(id),
  booking_id uuid REFERENCES bookings(id),
  discount_applied numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS policies for platform_settings
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read platform_settings" ON platform_settings FOR SELECT USING (true);
CREATE POLICY "Superadmins can write platform_settings" ON platform_settings FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
  )
);

-- RLS policies for coupons
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active coupons" ON coupons FOR SELECT USING (is_active = true);
CREATE POLICY "Superadmins can manage coupons" ON coupons FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
  )
);

ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own redemptions" ON coupon_redemptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Superadmins can manage redemptions" ON coupon_redemptions FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'superadmin'
  )
);
