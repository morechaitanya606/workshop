-- Migration: 20260312_host_application_types.sql
-- Description: Add application_type and details columns to host_applications table.

-- Add application_type and details to host_applications
alter table public.host_applications
    add column if not exists application_type text not null default 'creator',
    add column if not exists details jsonb not null default '{}'::jsonb;

-- Drop the old view if it exists (for safety, though we don't have one defined yet)

-- Update existing applications to be creators by default
update public.host_applications
set application_type = 'creator',
    details = jsonb_build_object()
where application_type is null;
