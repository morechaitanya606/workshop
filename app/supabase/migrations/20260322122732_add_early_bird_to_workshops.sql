-- Recovered from supabase_migrations.schema_migrations on the linked project.
--
-- This migration was applied directly to the database and its SQL never existed in the
-- repository, so the repo could not reproduce production. The body below is exactly what
-- the history table recorded as executed; it is checked in unchanged so the migration set
-- is complete. It is already applied -- do not re-run it by hand.

ALTER TABLE workshops ADD COLUMN early_bird_enabled boolean DEFAULT false;
ALTER TABLE workshops ADD COLUMN early_bird_discount_type text DEFAULT 'percentage';
ALTER TABLE workshops ADD COLUMN early_bird_discount_value integer DEFAULT 0;
ALTER TABLE workshops ADD COLUMN early_bird_days_after_listing integer DEFAULT 0;
;
