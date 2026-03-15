ALTER TABLE workshops
ADD COLUMN event_address text,
ADD COLUMN latitude double precision,
ADD COLUMN longitude double precision,
ADD COLUMN location_images text[] DEFAULT '{}';
